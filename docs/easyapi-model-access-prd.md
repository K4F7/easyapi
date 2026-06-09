# Product Requirements Document: EasyAPI 模型便捷接入与渠道体系

**Version**: 2.1  
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

## Phase 2（范围已收窄）

| 项 | 决策 |
|----|------|
| **接入文档** | 独立静态文档站（Vercel 部署，门户不内嵌 docs 包）；侧边栏 **文档（WIP）** 占位 `/dashboard/docs`；上线后设 `NEXT_PUBLIC_DOCS_URL` 切换外链并去掉 WIP |
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
- 测试：`pnpm test`（Vitest）、`pnpm test:e2e:ci`（Playwright，staging CD 门禁）

---

## 风险（仍有效）

| Risk | Mitigation |
|------|------------|
| NewAPI 分组名与门户映射不一致 | `NEWAPI_CHANNEL_GROUP_*` 集中配置；部署后核对 `/api/channels/tiers` |
| 上游生图 CSS 格式变化 | 单元测试覆盖 `stripPrefersColorSchemeDarkQueries`；E2E 深色 OS 抽检 |
| BFF 契约漂移 | `newapi-contract.md` + Vitest/E2E |

---

## 参考

- [MVP Changelog](./changelog-model-access-mvp.md)
- [签到诊断验收](./checkin-diagnostics.md)
- [NewAPI Contract](./newapi-contract.md)
- [Image Playground Security](./image-playground-security.md)
- [Test Deploy Guide](./test-deploy-easyapi-portal.md)

---

*v2.1：关闭 claude-latest / auto 阻塞项；操练场 Chat 改为 normal 渠道；收窄 Phase 2 范围并记录文档 WIP 占位。*
