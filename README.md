# sales-agent

面向 B 端销售团队的销转智能体工作台前端演示项目。项目当前使用本地 Mock 数据，无需后端服务即可运行。

## 技术栈

- Next.js 16（App Router）
- React 19
- TypeScript
- Tailwind CSS 4

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
```

## 交互说明

- “粘贴消息”优先读取系统剪贴板；无权限时自动填入演示消息。
- “分析客户”更新本地客户洞察。
- “生成回复”根据 Mock 数据生成建议回复。
- “一键复制”复制当前建议回复并展示完成状态。

页面已针对 1440×900 与 1920×1080 桌面分辨率进行布局校验。
