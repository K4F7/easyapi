# Product Requirements Document: EasyAPI 模型便捷接入与渠道体系

**Version**: 2.2  
**Date**: 2026-06-09  
**Status**: MVP 已交付；本文档跟踪**剩余 Phase 2** 与运维核对项

**已交付记录** → [changelog-model-access-mvp.md](./changelog-model-access-mvp.md)

---

## 产品目标（不变）

让开发者注册后即可获取 API Key、按渠道档位选择服务质量，并在 Playground 体验 Chat 与生图。门户专注用户侧；NewAPI 管理面不暴露。全站与生图嵌入区默认浅色。

---

## 已关闭项（原阻塞）

| 项 | 结论 |
|----|------|
| **`claude-latest` 别名** | 已在 `/v1/models` 暴露；本地 Dev Mock 与操练场模型列表可验收（2026-06-09） |
| **`auto` 跨组重试** | NewAPI 侧已处理跳组；操练场 Chat Token 使用 **`normal`（一般渠道）**，门户不传 `cross_group_retry`，用户仅需在 Chat 选模型 |

---

## 运维核对清单（发布前/后）

1. NewAPI 分组存在且与门户一致：`auto`、`budget`、`free`、`normal`、`stable`。
2. 环境变量（未设置则用代码默认）：`NEWAPI_CHANNEL_GROUP_AUTO=auto`，`LOW=budget`，`ACTIVITY=free`，`STANDARD=normal`，`PREMIUM=stable`；`PLAYGROUND_CHAT_GROUP=normal`。
3. Staging 抽检：`GET /api/channels/tiers` → 5 档 group；各档创建 Token 后 `group` 与 NewAPI 一致。
4. 模型别名：`gpt-latest`、`claude-latest` 均已验证。

---

## 接入文档（Phase 2）

正式接入文档**不在门户内维护**，而是部署在 **Vercel 上的独立静态文档站**（例如 `https://docs.easyapi.work`）。门户只提供跳转入口，不内嵌 docs 包，也不在门户路由下长期承载 `/docs` 内容。

### 目标行为

| 阶段 | 顶栏「文档」按钮 | 说明 |
|------|------------------|------|
| **当前（WIP）** | 跳转门户内 `/dashboard/docs` | 占位页，展示「文档站筹备中」与 WIP 标记；需登录，沿用控制台布局 |
| **上线后** | **新标签页打开 Vercel 文档站** | 配置 `NEXT_PUBLIC_DOCS_URL` 后，顶栏入口改为外链；移除 WIP 标记；用户离开门户阅读文档 |

### 配置与实现

- **环境变量**：`NEXT_PUBLIC_DOCS_URL` — 指向 Vercel 部署的文档站根 URL（如 `https://docs.easyapi.work`）。未设置时回退到 `/dashboard/docs` 占位。
- **门户逻辑**：`getDocsNavConfig()`（`newapi-portal/src/lib/docs-site.ts`）读取上述变量；`external: true` 时顶栏使用 `<a target="_blank">` 外链跳转。
- **门户不负责**：文档站构建、版本发布、搜索与导航结构；与 Portal CD 解耦，由文档仓库独立 Vercel 项目部署。
- **占位路由**：`/dashboard/docs` 仅作 WIP，**不是**最终文档 URL；不设门户根路径 `/docs` 作为正式文档站。

### 运维核对（文档上线时）

1. Vercel 文档站已部署并可公网访问（建议独立子域 `docs.*`）。
2. Portal staging / production 配置 `NEXT_PUBLIC_DOCS_URL` 为文档站完整 origin（含 `https://`，无尾部斜杠亦可）。
3. 抽检：登录控制台 → 顶栏「文档」→ 新标签打开文档站首页；WIP 徽章不再显示。
4. 可选：下线或保留 `/dashboard/docs` 占位页（仅作未配置环境时的回退）。

---

## Phase 2（范围已收窄）

| 项 | 决策 |
|----|------|
| **接入文档** | 见上文 **接入文档（Phase 2）** — Vercel 独立静态站 + `NEXT_PUBLIC_DOCS_URL` 外链跳转 |
| **深色模式** | **不做** |
| **Playground 增强** | **不做**（多会话、参数面板、渠道健康等）；保持简单调用 |
| **注册法律条款门** | **不做** |
| **E2E** | **不做**移动端专项；保留/关注无 `group` 旧 Token 向后兼容（`tokens-channel.spec.ts` + 单测） |

---

## 架构速查

```
前端 (apiFetch) → BFF (/api/*) → NewAPI
```

- 契约：`docs/newapi-contract.md`
- 生图安全：`docs/image-playground-security.md`
- 部署与 E2E 账号：`docs/test-deploy-easyapi-portal.md`
- 文档入口配置：`NEXT_PUBLIC_DOCS_URL`（`newapi-portal/.env.example`）
- 测试：`pnpm test`（Vitest）、`pnpm test:e2e:ci`（Playwright，staging CD 门禁）

---

## 风险（仍有效）

| Risk | Mitigation |
|------|------------|
| NewAPI 分组名与门户映射不一致 | `NEWAPI_CHANNEL_GROUP_*` 集中配置；部署后核对 `/api/channels/tiers` |
| 上游生图 CSS 格式变化 | 单元测试覆盖 `stripPrefersColorSchemeDarkQueries`；E2E 深色 OS 抽检 |
| BFF 契约漂移 | `newapi-contract.md` + Vitest/E2E |

---

## 后续方向

Portal 将按 **[portal-ui-shell-prd.md](./portal-ui-shell-prd.md)** 推进纯 UI 壳化：业务真源统一至 NewAPI，收缩本地 Prisma 职责。本 MVP PRD 中的渠道、Token、Playground 行为在壳化后保持不变。

---

## 参考

- [Portal UI Shell PRD](./portal-ui-shell-prd.md)
- [MVP Changelog](./changelog-model-access-mvp.md)
- [签到诊断验收](./checkin-diagnostics.md)
- [NewAPI Contract](./newapi-contract.md)
- [Image Playground Security](./image-playground-security.md)
- [Test Deploy Guide](./test-deploy-easyapi-portal.md)

---

*v2.2：明确接入文档由 Vercel 独立静态站承载，门户顶栏通过 `NEXT_PUBLIC_DOCS_URL` 外链跳转；`/dashboard/docs` 仅为 WIP 占位。*
