# Sales Agent Backend

## 知识增强 LLM 架构

第五阶段新增 `services/llm` 统一 ChatProvider，以及 `services/agent` 编排层。Provider 包含可重复、无外网调用的 `DeterministicTestChatProvider` 和 OpenAI Chat Completions 兼容实现；正式 Provider 支持普通与流式输出、JSON Schema、有限指数退避以及不支持 `response_format` 时的兼容回退，不会静默降级到测试模型。

生成顺序为：校验当前租户的智能体/客户/会话/客户消息 → Redis 并发租约 → 检索当前企业 ready/active 知识 → 保存引用快照 → 分层组装安全 Prompt → 调用模型 → 严格结构校验（失败仅修复一次）→ 引用白名单过滤 → 风险与人工接管规则复核 → 保存生成审计记录。只有销售人工确认后，`save-message` 才创建正式 assistant 消息。

新增迁移 `20260717_0003`，包含 `agents`、`agent_configs`、`generation_records`、`generation_sources`、`generation_feedback`，并扩展 `messages`。所有业务查询强制使用 JWT 租户上下文，客户端请求模型中禁止 `tenant_id`。

主要接口：

- `GET /api/v1/agents`、`GET /api/v1/agents/default`
- `GET|PUT /api/v1/agents/{id}/config`
- `GET /api/v1/agent/status`
- `POST /api/v1/agent/generate`、`POST /api/v1/agent/generate-stream`
- `GET /api/v1/agent/generations`、`GET /api/v1/agent/generations/{id}`
- `POST /api/v1/agent/generations/{id}/save-message`
- `POST /api/v1/agent/generations/{id}/feedback`
- `GET /api/v1/agent/usage/summary`

正式模型联调是可选检查。未配置密钥时自动化测试不会访问任何付费模型；配置后应按 `docs/llm-integration.md` 的用例进行少量人工验证。

销转智能体后端服务，基于 FastAPI、SQLAlchemy 2、PostgreSQL + pgvector、Alembic、Celery 和 Redis。当前范围包含多租户企业、认证、客户、会话以及企业知识库；不包含大语言模型回复、OCR 或销冠知识库。

## 架构

```text
backend/
├── app/
│   ├── api/v1/          # HTTP 路由
│   ├── core/            # 配置、安全与异常处理
│   ├── db/              # SQLAlchemy Base 和会话
│   ├── dependencies/    # JWT 当前用户依赖
│   ├── models/          # 六张业务表模型
│   ├── schemas/         # Pydantic 请求/响应结构
│   ├── services/        # 业务服务与知识解析/切片/向量/检索
│   ├── tasks/           # Celery 应用和文档处理任务
│   └── main.py          # FastAPI 应用入口
├── alembic/              # 数据库迁移
└── tests/                # 隔离测试数据库的自动化测试
```

## 环境要求

- Python 3.12
- PostgreSQL 16 + pgvector
- Redis 7
- Docker Desktop（可选）

## 本地安装

```bash
cd backend
python -m venv .venv
```

Windows PowerShell：

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

macOS / Linux：

```bash
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## 环境变量

参考 `.env.example`：

```dotenv
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/sales_agent
JWT_SECRET_KEY=replace-with-secure-key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
CORS_ORIGINS=http://localhost:3000
APP_ENV=development
TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/sales_agent_test
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1
KNOWLEDGE_STORAGE_PATH=./data/knowledge
KNOWLEDGE_MAX_FILE_SIZE_MB=20
KNOWLEDGE_ALLOWED_EXTENSIONS=pdf,docx,txt,md,xlsx,csv
CHUNK_TARGET_SIZE=600
CHUNK_OVERLAP=100
CHUNK_MIN_SIZE=80
EMBEDDING_PROVIDER=test
EMBEDDING_BASE_URL=
EMBEDDING_API_KEY=
EMBEDDING_MODEL=
EMBEDDING_DIMENSIONS=1536
EMBEDDING_BATCH_SIZE=32
EMBEDDING_TIMEOUT_SECONDS=30
```

生产环境必须更换高强度 `JWT_SECRET_KEY`。真实 `.env` 已被 Git 忽略。

## 数据库迁移

```bash
alembic upgrade head
alembic current
alembic downgrade -1
alembic upgrade head
```

应用启动时不会调用 `create_all`，正式表结构只通过 Alembic 管理。

## 启动服务

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API：<http://localhost:8000>
- 健康检查：<http://localhost:8000/health>
- Swagger：<http://localhost:8000/docs>
- OpenAPI JSON：<http://localhost:8000/openapi.json>

登录接口使用 `tenant_code + email + password`，因为不同企业允许使用相同邮箱。

## Docker 启动

在项目根目录执行：

```bash
docker compose up --build -d
docker compose ps
```

独立 `migrate` 服务等待 PostgreSQL 后执行一次 `alembic upgrade head`；`backend` 和 `worker` 同时等待 PostgreSQL、Redis 健康且迁移成功后启动。前端仍单独使用 `pnpm dev`。

停止服务：

```bash
docker compose down
```

如需同时删除开发数据库卷：

```bash
docker compose down -v
```

## 测试和静态检查

```bash
ruff check app tests alembic
python -m compileall -q app alembic
pytest
```

原有业务单元测试使用隔离的 SQLite 内存库；pgvector 与知识库链路使用独立 PostgreSQL `sales_agent_test`，测试前会确认测试库存在并运行 Alembic，不会清理开发或正式数据库。可通过 `TEST_DATABASE_URL` 改用专用测试实例。

## 企业知识库架构

```text
鉴权上传 -> UUID/租户目录存储 + SHA-256 -> processing job -> Redis
    -> Celery worker -> parser -> chunker -> EmbeddingProvider
    -> PostgreSQL vector(1536) + HNSW cosine index -> 引用检索
```

上传接口只安全保存文件、创建文档和任务记录并入队，不同步解析。worker 依次写入 `parsing`、`chunking`、`embedding`、`saving`、`completed` 和 0–100 进度。任务开启 late acknowledgement，且每次重新校验 `tenant_id + document_id + job_id`；成功任务可幂等重入，失败会保存结构化错误。管理员或经理可手动重新处理卡死/失败文档。

PDF 按页提取并保留页码，无有效文本时返回 `OCR_REQUIRED`；DOCX 保留标题、段落和表格；Markdown 保留标题层级；XLSX 使用只读与缓存值模式并保留工作表/行号；CSV 识别常见编码和分隔符。工作簿、CSV 和 Office 解压体积均有上限。

## Embedding 与检索

- `test`：本地确定性、无网络的 1536 维测试向量，只验证链路，不代表真实语义质量。
- `openai_compatible`：批量请求 OpenAI 兼容 `/embeddings` 端点，具有超时、有限重试、返回数量和维度校验。日志不输出 API Key 或文档正文。

`APP_ENV=production` 时禁止 `test` Provider，正式 Provider 配置不完整时启动失败。检索为 PostgreSQL 内执行的 cosine distance 升序排序，对外分数按 `1 - distance` 限制到 0–1，再使用 `min_score` 过滤。查询向量每次只生成一次，仅检索当前租户下 active 知识库的 ready 文档，无足够相关结果时返回空数组。

## 知识库 API

- 知识库：`GET|POST /api/v1/knowledge/bases`、`GET|PUT|DELETE /api/v1/knowledge/bases/{id}`
- 文档：`GET /api/v1/knowledge/documents`、`POST /api/v1/knowledge/documents/upload`、`GET|DELETE /api/v1/knowledge/documents/{id}`
- 状态与文件：`GET .../{id}/status`、`GET .../{id}/download`、`POST .../{id}/reprocess`
- 启停：`PATCH .../{id}/disable`、`PATCH .../{id}/enable`
- 切片：`GET /api/v1/knowledge/documents/{id}/chunks`
- 检索：`POST /api/v1/knowledge/search`

admin 可管理知识库和文档；manager 可上传、下载、重新处理、查看切片和检索；sales 只能查看 ready 文档、下载和检索。后端为每个资源查询强制附带 JWT 的 `tenant_id`，跨租户统一返回 404。

## 多租户隔离原则

1. JWT 包含 `user_id`、`tenant_id`、`role` 和 `exp`。
2. 业务请求体不接受 `tenant_id`，租户身份只从已验证 JWT 取得。
3. 客户、会话和消息查询始终同时限定资源 ID 与当前 `tenant_id`。
4. 创建会话前验证客户属于当前企业；创建消息前验证会话属于当前企业。
5. 访问其他企业资源统一返回 404，避免暴露资源是否存在。
6. 数据库层为所有租户业务表建立 `tenant_id` 索引，并约束企业内邮箱唯一。

当前隔离属于应用层行级隔离。后续进入高合规部署阶段时，可评估 PostgreSQL Row-Level Security 作为第二道防线。

## 前端集成说明

浏览器不会直接调用本服务，而是访问 Next.js 的同源 `/api` BFF。BFF 从 HttpOnly Cookie 读取 JWT 后再以 Bearer Token 转发；业务请求中的租户身份仍只由后端验证后的 JWT 决定。

会话列表支持可选的 `customer_id` 查询参数。传入时会先确认客户属于当前租户，再同时按 `tenant_id` 与 `customer_id` 筛选；其他租户的客户统一返回 404。`owner_user_id` 如被指定，也必须属于当前租户。
