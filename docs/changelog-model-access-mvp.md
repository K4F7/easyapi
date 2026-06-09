# Changelog: EasyAPI 模型便捷接入与渠道体系 MVP

**Released:** 2026-06-09  
**Test site:** https://test.easyapi.work

已完成交付记录。当前产品与阻塞项见 [easyapi-model-access-prd.md](./easyapi-model-access-prd.md)。

---

## 渠道与 Token

- **三档渠道 UI**：创建 Token 时选择低价 / 一般 / 高价；默认「一般渠道」；展示稳定性说明。
- **列表编辑渠道**：令牌页展示档位标签，支持行内修改 `group`；操练场专用 Token 不可编辑渠道。
- **BFF 路由**：`GET /api/channels/tiers`、`PUT /api/tokens/:id`（含 `group` 校验与错误信封）。
- **NewAPI 分组映射**（commit `542abe1e`）：低价 → `budget`，一般 → `normal`，高价 → `stable`；可通过 `NEWAPI_CHANNEL_GROUP_*` 覆盖。
- **真实路由验证**：staging 上创建/更新 Token 的 `group` 与 NewAPI 一致；`GET /api/channels/tiers` 返回 `budget` / `normal` / `stable`。

## Playground

- **Chat 自动开通**：进入操练场自动 provision Token；`group=auto`，`cross_group_retry=true`。
- **Chat 体验**：消息布局、模型选择器搜索/filter、建议语与模式 pill、流式输出与用量提示、停止/清空确认、上游错误脱敏。
- **生图 iframe 浅色**（不改 `gpt_image_playground` 镜像）：同源代理 `/playground/embed/` 注入浅色 HTML/CSS；`embed-config` 返回 `theme: light`；深色 OS 下 E2E 验收通过。
- **内部 URL**：`IMAGE_PLAYGROUND_INTERNAL_URL=http://image-playground-test`（Scheme 4 同源反代，非公网 `image.easyapi.work`）

## 门户体验

- **首次访问引导**：分步遮罩覆盖接入信息 → 创建 Token → 操练场；可跳过、可恢复。
- **全局默认浅色**：`color-scheme: light`；根节点不挂 `.dark`；Toast 使用 light 主题；深色 OS 下全站仍为浅色。

## BFF 与稳定性

- **通信架构**：前端仅调 `/api/*`；契约见 `docs/newapi-contract.md`；Dev Mock 覆盖 `group`。
- **单元测试**：107/107 Vitest 通过（含 tokens BFF、channel tiers、playground、dev-mock）。
- **核心流程 E2E**：注册、登录、Dashboard、Token、用量、操练场 Chat/生图在 staging CI 通过。

## Fastboot

- **脚本发布**：`https://easyapi.work/sh/claudecode.sh`、`https://easyapi.work/sh/opencode-ui.sh`（fastboot PR #1，`f6c49efa`）。
- **`gpt-latest`**：NewAPI 别名已验证（解析至 `gpt-5.5`）。

---

## 验收证据

| 项 | 证据 |
|----|------|
| Portal MVP 合并 | easyapi [PR #23](https://github.com/K4F7/easyapi/pull/23)，merge `5b7c82f7` |
| 分组映射对齐 | commit `542abe1e`；staging CD run `27208400768` 全绿 |
| Staging E2E | run `27156406233` / `27208400768`：`39 passed, 25 skipped` |
| Check-in 修复合并 | easyapi PR #26/#27/#28（workflow 本身仍被运维项阻塞，见 PRD） |
| PRD 状态同步 | easyapi PR #29 |

### E2E spec（已纳入 `test:e2e:ci`）

- `portal-smoke.spec.ts`
- `register-billing.spec.ts`
- `playground.spec.ts`
- `tokens-channel.spec.ts`
- `onboarding.spec.ts`
- `chat-polish.spec.ts`
- `theme-light.spec.ts`
- `image-playground-embed-light.spec.ts`

独立（非发布门禁）：`checkin-diagnostics.spec.ts`、`screenshots.spec.ts` — 签到任务详见 [checkin-diagnostics.md](./checkin-diagnostics.md)

---

## 关键实现位置

| 能力 | 路径 |
|------|------|
| 渠道档位 | `newapi-portal/src/lib/channels/tiers.ts` |
| Playground 渠道策略 | `newapi-portal/src/lib/playground/channel-policy.ts` |
| 生图代理浅色 | `newapi-portal/src/lib/playground/image-playground-proxy.ts` |
| Token BFF | `newapi-portal/src/app/api/tokens/` |
| E2E | `newapi-portal/tests/e2e/` |
