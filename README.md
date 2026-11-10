# BCE 1.1 · 离线演示站

BCE 业务上下文引擎的**纯前端演示版**：单页 React 应用 + 内嵌 mock 数据，
不连后端、不调模型、不读数据库。打包后的产物是纯静态文件，丢到任何静态托管
（Vercel / Netlify / GitHub Pages / 对象存储 / 本地目录）都能直接跑。

**这个目录是自包含的**：`src/` 里有完整的 UI 和 mock 数据，不需要 `../frontend`。
单独把这个文件夹拷走、或者推成一个独立仓库，都能正常安装和构建。

## 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:5175
npm run build      # 产物在 dist/
npm run preview    # 预览构建产物，http://127.0.0.1:5176
```

macOS 也可以直接双击 `start.command`：它会按需安装依赖、构建、起一个本地
静态服务器并打开浏览器（只需要 Node.js 18+ 和 python3）。

## 部署

产物用相对路径引资源（`base: './'`），所以放在子目录下也不会白屏。

| 平台 | 做法 |
|------|------|
| Vercel / Netlify | Root Directory 选本目录，Build `npm run build`，Output `dist` |
| GitHub Pages | 推仓库后跑 `npm run build`，把 `dist/` 发布到 Pages（或用 Actions） |
| 任意静态托管 / 本地 | 把 `dist/` 整个目录传上去，或 `cd dist && python3 -m http.server` |

## 演示边界

| 能力 | 演示站的表现 |
|------|--------------|
| 周报阅读、业务上下文、指标趋势、数据证据、待核事实 | 完整可点，数据来自 `src/mock-data.ts` 与 `src/sample-reports.ts` |
| 智能问答 | 预置问法返回内嵌答案；未预置的问题按关键词匹配到最接近的一条 |
| 写操作（导入、裁决、审批、状态推进、结果评估） | 只在内存生效，刷新即还原 |
| 身份 / 主题切换 | 可用，只影响前端展示 |
| 模型与 token | **不调用任何模型**，token 恒为 0 |

问答答案上的徽章分两种：

- **离线演示 · 预置答案** — 规则/模板类样本
- **离线演示 · 模拟 LLM 写 SQL** — 三道复合查询（窗口函数、JOIN+LIMIT、份额子查询）。
  真实系统里这类题由模型出查询意图、编译器落地 SQL；这里把那一轮的结果原样内嵌，
  SQL 与结果表严格同列，token 数字是模拟值

## 目录

```
vecel/
├── src/                  ← 完整 UI + mock 数据（从 ../frontend/src 同步而来）
│   ├── api.ts            ← 唯一的差异点：指向 mock-api，不打 /api/v1
│   ├── mock-api.ts       ← 离线 API 实现（内存态）
│   ├── mock-data.ts      ← 16 周周报衍生的指标、实体、建议、问答样本
│   └── components/       ← 与真实系统共用同一套组件
├── public/samples/       ← 16 份周报原文，「原文」链接指向这里
├── legacy/               ← 旧版独立 demo（用 vite 插件替换 frontend 的 api），已弃用
├── scripts/sync-ui.mjs   ← monorepo 内同步 UI 用，独立分发时不需要
├── start.command         ← macOS 双击启动
└── vite.config.ts
```

## 在 monorepo 里维护

`src/` 是 `../frontend/src` 的副本。改完真实系统的 UI 后，在本目录执行：

```bash
node scripts/sync-ui.mjs
```

它会把组件源码同步过来，但**跳过两个演示站专属文件**：

- `src/api.ts` —— 演示站的数据层必须指向 mock
- `src/components/panels/AskPanel.tsx` —— 演示站多挂三条「模型写 SQL」的快捷问题

这两个文件不要被同步覆盖，也不要删。
