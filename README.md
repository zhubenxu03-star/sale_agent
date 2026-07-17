# sales-agent

面向 B 端销售团队的销转智能体项目。仓库包含已完成的 Next.js 工作台原型，以及独立的 FastAPI 多租户后端基础服务。

## 技术栈

- Next.js 16（App Router）
- React 19
- TypeScript
- Tailwind CSS 4
- Python 3.12 / FastAPI
- SQLAlchemy 2 / PostgreSQL / Alembic
- JWT / pwdlib / pytest

## 本地运行

```bash
pnpm install
pnpm dev
```

浏览器访问 [http://localhost:3000](http://localhost:3000)。

也可以使用 npm：

```bash
npm install
npm run dev
```

## 常用命令

```bash
pnpm lint
pnpm build
pnpm start
```

## 目录结构

```text
src/
├── app/                 # 页面入口、全局样式和主题变量
├── components/          # 工作台可复用组件
│   ├── Sidebar.tsx
│   ├── Header.tsx
│   ├── MetricCard.tsx
│   ├── ChatPanel.tsx
│   ├── CustomerPanel.tsx
│   ├── KnowledgePanel.tsx
│   ├── ChampionPanel.tsx
│   └── Workflow.tsx
├── data/                # 本地 Mock 数据
└── types/               # TypeScript 类型定义
backend/
├── app/                 # FastAPI 应用、模型和 API
├── alembic/             # PostgreSQL 迁移
└── tests/               # 后端自动化测试
docker-compose.yml       # PostgreSQL + 后端服务
```

## 交互说明

- “粘贴消息”优先读取系统剪贴板；无权限时自动填入演示消息。
- “分析客户”更新本地客户洞察。
- “生成回复”根据 Mock 数据生成建议回复。
- “一键复制”复制当前建议回复并展示完成状态。

页面已针对 1440×900 与 1920×1080 桌面分辨率进行布局校验。

## 后端快速启动

推荐使用 Docker：

```bash
docker compose up --build -d
```

启动后访问：

- 健康检查：<http://localhost:8000/health>
- Swagger：<http://localhost:8000/docs>

本地 Python 安装、环境变量、迁移、测试命令和多租户隔离原则详见 [`backend/README.md`](backend/README.md)。前端开发服务继续单独执行 `pnpm dev`。
