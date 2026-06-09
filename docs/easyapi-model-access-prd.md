# Product Requirements Document: EasyAPI 模型便捷接入与渠道体系

**Version**: 2.0  
**Date**: 2026-06-09  
**Status**: MVP 已交付；本文档仅跟踪**未完成项**与 **Phase 2**

**已交付记录** → [changelog-model-access-mvp.md](./changelog-model-access-mvp.md)

---

## 产品目标（不变）

让开发者注册后即可获取 API Key、按三档渠道选择服务质量，并在 Playground 体验 Chat 与生图。门户专注用户侧；NewAPI 管理面不暴露。全站与生图嵌入区默认浅色（深色模式适配列为 Phase 2）。

---

## 当前阻塞项

| 项 | 负责 | 说明 |
|----|------|------|
| **`claude-latest` 别名可见性** | NewAPI 运营 | Fastboot 已发布别名；`/v1/models` 不暴露 `claude-latest`，无法从公开模型列表验收 |
| **`auto` 跳组顺序文档** | NewAPI 运营 | 操练场 Chat Token 使用 `group=auto` + `cross_group_retry`；门户不硬编码顺序。需在运维文档中记录 NewAPI 后台推荐顺序（自下而上：如 `budget` → `normal` → `stable`），并完成一次后台确认 |

---

## 运维核对清单（发布前/后）

1. NewAPI 分组存在且与门户一致：`auto`、`budget`、`normal`、`stable`（`free` 为活动组，门户三档不映射）。
2. 环境变量（未设置则用代码默认）：`NEWAPI_CHANNEL_GROUP_LOW=budget`，`STANDARD=normal`，`PREMIUM=stable`；`PLAYGROUND_CHAT_GROUP=auto`。
3. Staging 抽检：`GET /api/channels/tiers` → `budget` / `normal` / `stable`；各档创建 Token 后 `group` 与 NewAPI 一致。
4. 模型别名：`gpt-latest` 已验证；`claude-latest` 待 `/v1/models` 暴露后复验。

---

## Phase 2（未开始）

- 接入文档页（静态站或门户 `/docs`）
- 全站深色模式适配
- Playground 增强：多会话历史、参数面板、渠道健康只读展示
- 注册法律条款门（需法务文案）
- 可选 E2E：`E2E-C02` 移动端 375px；`E2E-T06` 无 `group` 旧 Token 向后兼容专项

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
- NewAPI 故障转移：[PR #2426](https://github.com/QuantumNous/new-api/pull/2426)、[PR #4226](https://github.com/QuantumNous/new-api/pull/4226)

---

*v2.0：MVP 交付内容迁入 changelog；PRD 仅保留阻塞项、运维清单与 Phase 2。历史 v1.x 见 git 历史。*
