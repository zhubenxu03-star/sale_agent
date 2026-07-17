# Sales Agent Backend

销转智能体第二阶段后端基础服务，基于 FastAPI、SQLAlchemy 2、PostgreSQL 和 Alembic。当前范围仅包含多租户企业、认证、客户和会话数据，不包含大语言模型或知识库能力。

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
│   ├── services/        # 注册和认证事务服务
│   └── main.py          # FastAPI 应用入口
├── alembic/              # 数据库迁移
└── tests/                # 隔离测试数据库的自动化测试
```

## 环境要求

- Python 3.12
- PostgreSQL 16（推荐；PostgreSQL 14+ 可运行）
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

容器后端会等待 PostgreSQL 健康检查通过，自动执行 `alembic upgrade head`，再启动 Uvicorn。前端仍单独使用 `pnpm dev`。

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

pytest 使用独立的内存数据库，并为每个测试重建表，不会连接或清理开发/正式数据库。

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
