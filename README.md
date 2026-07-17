# sales-agent

面向 B 端销售团队的多租户销转智能工作台。当前版本已完成 Next.js 工作台、FastAPI 后端基础，以及企业注册、登录、客户、会话和消息的真实数据链路。

当前已完成企业知识库的文件上传、异步解析、切片、Embedding、pgvector 检索和工作台手动检索链路。回复生成仍为明确标记的本地模拟，不调用大语言模型；销冠知识库尚未开放。

## 技术栈

- Next.js 16（App Router）、React 19、TypeScript、Tailwind CSS 4
- TanStack Query、React Hook Form、Zod
- Python 3.12、FastAPI、SQLAlchemy 2、PostgreSQL + pgvector、Alembic
- Celery、Redis、PyMuPDF、python-docx、openpyxl、tiktoken
- JWT、pwdlib、pytest、Vitest、Playwright Core

## 请求与认证架构

```text
浏览器
  └─ /api/*（Next.js Route Handler / BFF）
       └─ Authorization: Bearer <JWT>（仅服务端转发）
            └─ FastAPI :8000
                 └─ PostgreSQL :5432
```

FastAPI 返回的 JWT 仅保存在 Next.js 设置的 HttpOnly Cookie 中，配置为 `sameSite=lax`、`path=/`，生产环境启用 `secure`。浏览器代码不读取 Token，也不使用 `localStorage`、`sessionStorage` 或普通 Cookie 保存 Token。业务请求体中的 `tenant_id` 会在 BFF 与后端两层拒绝，租户身份始终来自已验证 JWT。

## 本地启动

环境要求：Node.js、pnpm、Docker Desktop；本地运行后端时另需 Python 3.12。

1. 启动 PostgreSQL 和 FastAPI：

```bash
docker compose up --build -d
docker compose ps
```

2. 准备前端服务端环境变量：

```powershell
Copy-Item .env.example .env.local
```

```dotenv
BACKEND_API_URL=http://localhost:8000
AUTH_COOKIE_MAX_AGE_SECONDS=86400
```

不要将后端地址改为 `NEXT_PUBLIC_*` 变量；`.env.local` 不应提交。

3. 启动前端：

```bash
pnpm install
pnpm dev
```

访问：

- 工作台：<http://localhost:3000>
- 企业注册：<http://localhost:3000/register>
- 登录：<http://localhost:3000/login>
- 后端健康检查：<http://localhost:8000/health>
- Swagger：<http://localhost:8000/docs>
- 企业知识库：<http://localhost:3000/knowledge>

## 主要目录

```text
src/
├─ app/
│  ├─ api/                 # BFF Route Handlers
│  ├─ login/               # 登录页
│  ├─ register/            # 企业注册页
│  └─ page.tsx             # 受保护工作台入口
├─ components/
│  ├─ auth/                # 登录保护与认证布局
│  ├─ customers/           # 客户表单、选择、删除确认
│  ├─ conversations/       # 会话创建弹窗
│  └─ providers/           # QueryClient 与统一 Toast
├─ hooks/                  # 认证、客户、会话与消息查询
├─ lib/
│  ├─ api/                 # 浏览器统一请求与错误解析
│  ├─ auth/                # 认证常量
│  ├─ bff/                 # 服务端转发、Cookie 与安全校验
│  └─ query/               # 集中 Query Keys
├─ schemas/                # Zod 表单规则
└─ types/                  # API 与页面类型
backend/                   # FastAPI、迁移和后端测试
scripts/smoke-e2e.mjs      # 独立测试企业的集成冒烟测试
```

## BFF 接口

- 认证：`POST /api/auth/register`、`POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me`
- 客户：`GET|POST /api/customers`、`GET|PUT|DELETE /api/customers/{id}`
- 会话：`GET|POST /api/conversations`、`GET /api/conversations/{id}`、`PATCH /api/conversations/{id}/archive`
- 消息：`GET|POST /api/conversations/{id}/messages`
- 知识库：`/api/knowledge/bases`、`/api/knowledge/documents`、`/api/knowledge/documents/upload`、`/api/knowledge/search`

BFF 对后端请求设置 10 秒超时；后端不可用时返回结构化 503；FastAPI 的状态码和错误结构会保留。401 会清除失效 Cookie，前端同时清理查询缓存并返回登录页。

## 检查与测试

前端：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

后端：

```bash
cd backend
ruff check app tests alembic
python -m compileall -q app alembic
pytest
alembic check
```

完整集成冒烟测试需要 PostgreSQL、FastAPI 与 Next.js 均已启动，并会创建时间戳命名的独立测试企业：

```bash
pnpm test:e2e
```

测试覆盖企业注册与自动登录、HttpOnly Cookie、客户与会话创建、客户消息与模拟回复保存、刷新恢复、退出保护、重新登录，以及跨企业前端数据隔离。截图输出到已忽略的 `test-results/`。

更多后端安装、迁移、异步任务、Embedding 配置及多租户原则见 [backend/README.md](backend/README.md)。

## 企业知识库

支持 PDF、DOCX、TXT、MD、XLSX 和 CSV。浏览器只访问 Next.js BFF：上传由 BFF 转发 multipart，下载由 BFF 流式转发，不会暴露 JWT、磁盘路径或 `storage_key`。文件使用 UUID 存储名并按租户分目录，上传时检查扩展名、MIME、文件签名、大小、Office 解压体积和 SHA-256。

开发环境默认使用确定性测试向量，页面会显示明确警告，仅用于验证数据链路。生产环境必须设置 `EMBEDDING_PROVIDER=openai_compatible` 及有效的服务地址、密钥和模型；配置缺失时应用拒绝启动，不会静默降级到测试向量。

Docker Compose 使用独立的 `migrate` 一次性服务执行 Alembic，`backend` 和 `worker` 在迁移成功后启动；常规容器重启不会重复执行迁移命令。Redis、PostgreSQL 和知识文件均使用持久化 volume。
