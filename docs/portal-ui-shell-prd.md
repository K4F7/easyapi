# Product Requirements Document: Portal 纯 UI 壳化

**Version**: 1.0  
**Date**: 2026-06-10  
**Status**: 规划中（取代本地业务真源，统一以 NewAPI 为系统记录）

**前置文档** → [easyapi-model-access-prd.md](./easyapi-model-access-prd.md)（模型接入 MVP，已交付）  
**契约** → [newapi-contract.md](./newapi-contract.md)（随迁移同步扩展）

---

## 1. 产品目标

将 EasyAPI Portal **完全**定位为面向开发者的 **UI 壳 + BFF**，所有用户身份、额度、API Key、签到、邀请返利、充值支付、用量日志的**权威数据与业务规则**均由上游 [NewAPI](https://github.com/QuantumNous/new-api) 承担。

Portal 只做：

- 品牌化用户界面与交互
- 同源 BFF（`/api/*`）代理与字段适配
- 不暴露 NewAPI 管理面的安全边界
- Playground、渠道档位文案等 **NewAPI 未提供的体验层**

Portal **不做**：

- 在自有数据库中维护与 NewAPI 重复的业务真源
- 通过 Admin Token 代为用户发放本可由用户态 API 完成的额度变更（除明确保留的运维例外）
- 浏览器直连 NewAPI 主机

---

## 2. 架构原则（不可协商）

### 2.1 数据真源

| 数据域 | 真源 | Portal 允许的行为 |
|--------|------|-------------------|
| 用户账号与密码 | NewAPI | BFF 代理注册/登录；可缓存 `newApiUserId` + 加密 access token |
| 剩余额度 / 已用额度 | NewAPI `GET /api/user/self` | 展示、格式化（CNY 换算） |
| API Key / Token | NewAPI `/api/token/*` | CRUD 代理；列表响应脱敏 |
| 签到状态与奖励 | NewAPI `/api/user/checkin` | BFF 转发；读取 `checkin_enabled` |
| 邀请码与返利 | NewAPI `aff_code`、`/api/user/aff`、`/api/user/aff_transfer` | 展示与操作代理 |
| 兑换码充值 | NewAPI `POST /api/user/topup` | BFF 代理 |
| 在线支付 | NewAPI `POST /api/user/pay`；回调 `GET /api/user/epay/notify` | 创建订单代理；回调**仅**落在 NewAPI |
| 用量与日志 | NewAPI `/api/log/self`、`/api/data/self` | 聚合展示 |

### 2.2 请求链路（目标态）

```
浏览器 (apiFetch)
  → Portal BFF (/api/*)
    → NewAPI（用户态或公开接口）
```

例外：Playground 流式与生图 embed 代理仍经 BFF，但不引入本地业务表。

### 2.3 Portal 本地存储的允许范围（收缩后）

迁移完成后，Portal PostgreSQL（`newapi_portal` schema）**仅**可保留：

| 用途 | 说明 | 是否必须 |
|------|------|----------|
| **会话桥接** | `Session` + 加密的 NewAPI access token 引用 | 是（Phase 4 前） |
| **用户绑定** | `User.newApiUserId`、token 密文、最后登录时间 | 是（薄影子用户） |
| **可选审计** | 无业务语义的访问日志（若保留 `AuditLog`） | 否 |

**必须移除**（不得再以 Portal DB 为真源）：

- `Checkin` — 改由 NewAPI 签到表
- `Referral` + 本地 `inviteCode` 体系 — 改由 NewAPI `aff_*`
- `WalletLedger` 中与额度发放相关的流水 — 额度变更以 NewAPI 为准
- `Order` 影子订单表 — 支付状态以 NewAPI + 支付网关为准（除非上游无历史 API 且产品强需本地展示，见 Phase 3）
- 通过 `POST /api/user/manage`（admin `add_quota`）实现的**用户签到/邀请/注册送额度**

---

## 3. 现状与差距

### 3.1 已符合 UI 壳

| 能力 | 状态 |
|------|------|
| Token CRUD + reveal key | ✅ 全走 NewAPI |
| 兑换码充值 | ✅ `POST /api/user/topup` |
| 发起支付 | ✅ `POST /api/user/pay` |
| 支付回调 | ✅ 归属 NewAPI（Portal notify 返回 410） |
| 用量 / 日志 | ✅ NewAPI |
| 注册 / 登录 | ✅ NewAPI 为先，Portal 建 session |

### 3.2 待迁移（重复实现）

| 能力 | 现状 | 目标 |
|------|------|------|
| **每日签到** | Portal `Checkin` + `WalletLedger` + admin `add_quota` | `GET/POST /api/user/checkin` |
| **邀请返利** | 本地 `inviteCode`、`Referral`；`INVITE_REWARD_QUOTA` 未接线 | `GET /api/user/aff`；注册 `aff_code`；`aff_transfer` UI |
| **注册礼包** | admin `add_quota` + 本地 ledger | 由 NewAPI 运营配置或上游注册奖励策略承担；Portal 不自行发额度 |
| **订单历史** | 本地 `Order`（多处于 PENDING） | 以 NewAPI 余额刷新为准；无上游列表则简化 UI 或后续对接 |
| **Dashboard 签到摘要** | 读 Prisma `Checkin` | 读 NewAPI checkin stats |

### 3.3 体验层保留在 Portal（非业务真源）

- 渠道五档文案：`GET /api/channels/tiers`（`group` 仍转发 NewAPI）
- `remain_quota_cny` → `remain_quota` 换算
- Token 列表 key 脱敏
- Playground 托管 Token、流式代理、生图 embed 安全（见 [image-playground-security.md](./image-playground-security.md)）
- 中文 BFF 错误信封
- 文档外链 `NEXT_PUBLIC_DOCS_URL`

---

## 4. 分阶段交付

### Phase 1 — 签到原生化（P0）

**目标**：删除 Portal 侧签到真源与 admin 发额度路径。

| 项 | 要求 |
|----|------|
| BFF | `POST /api/checkin` 改为代理 `POST /api/user/checkin`（支持 `?turnstile=`） |
| BFF | `GET /api/dashboard/summary` 的 `checkin` 字段改从 `GET /api/user/checkin?month=` 派生 |
| 配置 | 读取 `GET /api/status` 的 `checkin_enabled`；未启用时 UI 隐藏签到 |
| 删除 | Prisma `Checkin` 表及相关 `WalletLedger` 签到流水 |
| 删除 | `CHECKIN_QUOTA`、`applyCheckinQuota`、签到对 `NEWAPI_ADMIN_TOKEN` 的依赖 |
| 文档 | 更新 [checkin-diagnostics.md](./checkin-diagnostics.md) 与 [newapi-contract.md](./newapi-contract.md) |
| 验收 | Staging：`POST /api/checkin` 2xx 后 `GET /api/user/self` 额度增加；同日重复签到返回上游幂等错误 |

### Phase 2 — 邀请返利原生化（P0）

**目标**：单一邀请体系，以 NewAPI `aff` 为准。

| 项 | 要求 |
|----|------|
| 邀请链接 | 使用 `GET /api/user/aff` 返回的 `aff_code`（或 `self.aff_code`） |
| 注册 | 继续传 `aff_code`；**禁止**仅校验 Portal 本地 `inviteCode` |
| UI | 展示 `aff_count`、`aff_quota`、`aff_history_quota`；提供「划转返利额度」调用 `POST /api/user/aff_transfer` |
| 删除 | `Referral` 表、本地 `inviteCode` 生成与校验、`INVITE_REWARD_QUOTA` 占位配置 |
| 删除 | 注册后 admin `add_quota` 邀请奖励（若存在） |
| 验收 | 邀请注册后 NewAPI `inviter_id` 正确；邀请人 `aff_count` 增加 |

### Phase 3 — 计费与账本收缩（P1）

**目标**：兑换/支付不再写本地额度流水。

| 项 | 要求 |
|----|------|
| 兑换 | `POST /api/billing/redeem` 仅代理 `topup`；移除 `WalletLedger` 幂等表或降为可选 debug |
| 支付 | `POST /api/billing/epay/create` 仅代理 `pay`；不依赖本地 `Order` 判断到账 |
| 到账确认 | `GET /api/billing/epay/return` 引导用户刷新；以 `GET /api/user/self` 为准 |
| 订单列表 | 若无 NewAPI 订单 API：下线或只读展示「发起支付记录」；**不得**伪造 PAID 状态 |
| 删除 | `Order` 表（若产品接受无历史列表） |
| 验收 | 兑换/支付后余额与 NewAPI 一致；Portal DB 无额度相关写入 |

### Phase 4 — 认证薄化（P1）

**目标**：Portal 用户表极薄化；消除 `portal_legacy` 双轨。

| 项 | 要求 |
|----|------|
| 登录 | 仅 NewAPI 密码登录（含 2FA 流程补齐或明确不支持策略） |
| 用户表 | 保留 `newApiUserId`、token 密文、`email`/`username` 展示字段；移除 `passwordHash`（新用户） |
| 会话 | 评估 token 刷新：`GET /api/user/token` 定期轮换策略 |
| 删除 | `portal_legacy` 登录路径与本地密码校验 |
| 验收 | 新注册用户无本地密码；全链路仅 NewAPI 校验身份 |

### Phase 5 — Schema 与运维清理（P2）

| 项 | 要求 |
|----|------|
| Prisma | 移除 `Checkin`、`Referral`、`Order`、`WalletLedger`（按 Phase 1–3 完成情况） |
| 环境变量 | 移除 `CHECKIN_QUOTA`、`INVITE_REWARD_QUOTA`、`REGISTER_QUOTA`（若不再 admin 发额度） |
| Admin Token | `NEWAPI_ADMIN_TOKEN` 仅用于运维脚本或明确管理功能，**不**进入用户签到/邀请/注册热路径 |
| CI | 更新 Vitest / Playwright / `checkin-diagnostics` workflow |
| 契约 | `newapi-contract.md` 增补 checkin、aff、amount 等端点 |

---

## 5. 功能需求明细

### 5.1 认证与会话

- 注册：`POST /api/auth/register` → NewAPI register → login/token → Portal session。
- 登录：`POST /api/auth/login` → NewAPI login → session。
- 登出：Portal 撤销 session；可选代理 `GET /api/user/logout`。
- 浏览器**不得**持有 NewAPI Admin Token 或明文用户 access token（仅 HttpOnly 会话）。

### 5.2 API Key 管理

- 行为保持 MVP：[easyapi-model-access-prd.md](./easyapi-model-access-prd.md) 渠道档位与 BFF 契约不变。
- 禁止在 Portal DB 存储 key 明文或 hash。

### 5.3 签到

- 开关：`status.checkin_enabled === false` 时不展示签到入口。
- 展示：当月日历、累计签到次数、本次获得额度（来自上游 `quota_awarded`）。
- 安全：上游启用 Turnstile 时，BFF 透传 `turnstile` query。

### 5.4 邀请返利

- 邀请链接格式：`/register?aff_code={code}`（兼容只读旧链 `inviteCode` 一版后废弃）。
- 控制台展示返利统计与划转操作。
- 营销文案「邀请好友返利」须与 NewAPI 实际返利策略一致。

### 5.5 计费

- 兑换码：代理 `topup`，展示到账额度。
- 易支付：代理 `pay`；`return_url` 指向 Portal；`notify_url` 配置在 NewAPI 公网地址。
- 余额展示：统一来自 `GET /api/user/self` 的 `quota`（剩余额度）。

### 5.6 Dashboard 摘要

- `GET /api/dashboard/summary` 组合：
  - NewAPI：`self`、checkin stats、可选 notice
  - Portal：仅会话用户绑定信息
- **禁止**从 Portal DB 读取额度或签到真源。

---

## 6. 非功能需求

| 类别 | 要求 |
|------|------|
| 安全 | BFF 统一鉴权；上游错误不泄漏原始 payload 到浏览器 |
| 可观测 | 结构化日志记录 `newApiUserId`、route、upstream status |
| 兼容 | 迁移期可只读兼容旧 `inviteCode` 查询参数一个版本 |
| 测试 | 每 Phase 更新单测；P0 Phase 更新 staging E2E |
| 文档 | 契约、部署指南、诊断文档与 PRD 同步 |

---

## 7. 验收标准（整体完成定义）

满足以下全部条件视为 **Portal 纯 UI 壳** 达标：

1. **零本地业务真源**：Prisma 中不存在 Checkin、Referral、Order、WalletLedger 额度流水（或仅剩明确标注的非权威审计表）。
2. **零用户热路径 Admin Quota**：签到、邀请、注册、兑换、支付不调用 `POST /api/user/manage`。
3. **余额一致**：任意计费/签到操作后，Portal 展示余额与 NewAPI `self.quota` 一致。
4. **Token 一致**：Portal 创建的 Token 在 NewAPI 列表可见且 `group` 正确。
5. **契约完整**：`newapi-contract.md` 覆盖所有 BFF 依赖的 NewAPI 端点。
6. **README 架构约束** 与实现一致（见仓库根目录 README）。

---

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 部署的 NewAPI 版本无 `checkin` API | 升级至含 PR #2565 的版本；`checkin_enabled` 关闭时隐藏功能 |
| 双邀请码历史数据 | 迁移脚本将展示改为 `aff_code`；旧 `inviteCode` 只读重定向一期 |
| 去掉 `Order` 后无支付历史 | 产品接受「仅刷新余额」或后续对接 NewAPI 订单 API |
| 2FA 登录未完成 | Phase 4 前在 PRD 范围外标注；或实现 NewAPI 2FA 步骤 |
| `NEWAPI_ADMIN_TOKEN` 漂移 | 用户热路径不再依赖；运维文档弱化 admin 与用户功能耦合 |

---

## 9. 明确不做

- NewAPI 管理后台 UI 嵌入或暴露
- Portal 内维护独立计费引擎或额度账本
- 深色模式、Playground 多会话等（仍遵循 [easyapi-model-access-prd.md](./easyapi-model-access-prd.md) Phase 2 决策）
- 在 Portal 接收支付网关 notify

---

## 10. 参考

- [NewAPI 用户模块文档](https://doc.newapi.pro/en/api/fei-user/)
- [NewAPI Check-in PR #2565](https://github.com/QuantumNous/new-api/pull/2565)
- [newapi-contract.md](./newapi-contract.md)
- [checkin-diagnostics.md](./checkin-diagnostics.md)
- [test-deploy-easyapi-portal.md](./test-deploy-easyapi-portal.md)
- [changelog-model-access-mvp.md](./changelog-model-access-mvp.md)

---

*v1.0：确立 Portal 纯 UI 壳目标、分阶段迁移路径与整体验收标准。*
