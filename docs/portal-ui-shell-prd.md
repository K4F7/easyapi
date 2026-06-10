# Product Requirements Document: Portal 纯 UI 壳

**Version**: 2.0  
**Date**: 2026-06-10  
**Status**: **已交付（架构层）** — 用户热路径不再维护 Portal 本地业务真源；体验层 backlog 见 §8

**取代** → v1.0 迁移规划（Phase 1–5 已在代码与 Schema 落地）  
**前置** → [easyapi-model-access-prd.md](./easyapi-model-access-prd.md)（模型接入 MVP）  
**契约** → [newapi-contract.md](./newapi-contract.md)  
**UI 变更记录** → [portal-ui-shell-ui-changes.md](./portal-ui-shell-ui-changes.md)

---

## 1. 产品定位（定稿）

EasyAPI Portal 是面向开发者的 **品牌化 UI + 同源 BFF**，**不是**第二个计费/签到/邀请系统。

| Portal 做 | Portal 不做 |
|-----------|-------------|
| 用户界面与交互 | 在 PostgreSQL 维护与 NewAPI 重复的额度/签到/邀请/订单真源 |
| `/api/*` BFF 代理与字段适配 | 用户热路径调用 Admin `add_quota` |
| 隐藏 NewAPI 管理面与上游主机 | 浏览器直连 NewAPI 做鉴权业务 |
| 渠道档位文案、Playground 代理、CNY 展示、中文错误信封 | 接收支付网关 notify（归属 NewAPI） |
| HttpOnly 会话 + 加密缓存 NewAPI access token | 本地密码登录、`portal_legacy` 双轨 |

### 1.1 请求链路（强制）

```
浏览器 (apiFetch)
  → Portal BFF (/api/*)
    → NewAPI（用户态或公开接口）
```

Playground 流式与生图 embed 仍经 BFF；不为此引入本地业务表。

---

## 2. 数据真源（定稿）

| 数据域 | 真源 | Portal BFF |
|--------|------|-------------|
| 账号与密码 | NewAPI | `POST /api/auth/register`、`POST /api/auth/login` |
| 剩余/已用额度 | NewAPI `GET /api/user/self` | `GET /api/dashboard/summary`、各页 `useQuotaFormat` |
| API Key | NewAPI `/api/token/*` | `GET/POST/PUT/DELETE /api/tokens` |
| 签到 | NewAPI `/api/user/checkin` | `POST /api/checkin`；摘要读 `GET /api/user/checkin?month=` |
| 邀请返利 | NewAPI `aff_code`、`/api/user/aff`、`/api/user/aff_transfer` | `GET/POST /api/aff`；注册传 `aff_code` |
| 兑换码 | NewAPI `POST /api/user/topup` | `POST /api/billing/redeem` |
| 在线支付 | NewAPI `POST /api/user/pay`；notify 在 NewAPI | `POST /api/billing/epay/create`；Portal notify **410** |
| 用量日志 | NewAPI log/data API | `GET /api/usage` 等 |

---

## 3. Portal 本地存储（定稿）

PostgreSQL `newapi_portal` schema **仅允许**：

| 模型 | 用途 |
|------|------|
| `User` | 薄绑定：`email`、`username`、`newApiUserId`、加密 access token、登录时间 |
| `Session` | HttpOnly `portal_session` 桥接 |
| `AuditLog` | 可选非权威审计（如注册事件）；**不得**作为额度/签到真源 |

**已删除**（迁移 `20260610120000_phase5_schema_cleanup`）：`Checkin`、`Referral`、`Order`、`WalletLedger` 及 `User.passwordHash`、`User.inviteCode`。

---

## 4. 已交付能力

### 4.1 BFF / 后端（✅）

| 能力 | 实现 |
|------|------|
| 签到 | 代理 NewAPI；`checkin_enabled` 关闭时 BFF 403 / UI 隐藏 |
| Dashboard 签到摘要 | 来自 NewAPI checkin stats，非 Prisma |
| 邀请注册 | `POST /api/auth/register` 仅传 `affCode` → NewAPI `aff_code` |
| 邀请返利 API | `GET/POST /api/aff` |
| 兑换 / 支付 | 纯代理 topup / pay；无本地 ledger 写入 |
| 订单列表 | `GET /api/billing/orders` 返回空列表 + 说明（不伪造 PAID） |
| 登录 | 仅 NewAPI 密码登录；**无** `portal_legacy`、**无** 2FA 分支 |
| Token CRUD | MVP 行为不变 |
| 支付回调 | Portal `epay/notify` → 410 |

### 4.2 认证策略（✅ 产品决策）

- **2FA**：平台不使用 2FA；不实现 NewAPI 2FA 步骤，不在 BFF 暴露 `NEWAPI_2FA_REQUIRED`。
- **邀请链接**：仅 `/register?aff_code={code}`；**不兼容**旧 `?inviteCode=` URL。
- **Admin Token**：`NEWAPI_ADMIN_TOKEN` 运行时可选；仅 seed/运维脚本通过 `getNewApiAdminEnv()` 使用，**不进入用户热路径**。

### 4.3 UI（部分 ✅，见 [portal-ui-shell-ui-changes.md](./portal-ui-shell-ui-changes.md)）

| 区域 | 状态 |
|------|------|
| 签到卡片 | ✅ `checkin.enabled` 门控；去掉旧「重试发放」流程 |
| 签到 Toast | ✅ 成功时展示本次获得额度（`formatBalance(quotaAmount)`）；重复签到「今日已签到」 |
| 充值页 | ✅ 去掉本地订单表格；余额以 NewAPI 为准 |
| 注册页 | ✅ URL/body 使用 `aff_code` / `affCode`；文案保持重构前样式 |
| 邀请返利控制台 | ⏳ **未做**（BFF 已有，Dashboard 无 UI） |
| 签到日历 / Turnstile 控件 | ⏳ **未做**（非壳化阻塞项） |

### 4.4 测试与 Staging（✅）

| 项 | 状态 |
|----|------|
| 单元测试 | 175+ cases（aff、billing、auth-login、checkin 等） |
| Staging 签到 E2E | `pnpm test:e2e:checkin` @ `https://test.easyapi.work` 已通过 |
| CI | `portal-ci.yml` lint / typecheck / test / build |

---

## 5. 功能需求（运行态）

### 5.1 认证与会话

- 注册：NewAPI register → login/token → Portal session；可选 `affCode`。
- 登录：NewAPI login only → session。
- 浏览器不得持有 Admin Token 或明文用户 access token。

### 5.2 签到

- 开关：`GET /api/status` → `checkin_enabled === false` 时不展示入口。
- 操作：`POST /api/checkin` 代理上游；支持 `turnstile` query/body。
- 反馈：Toast 须展示本次 `quotaAmount`（有值时）。

### 5.3 邀请返利

- 注册链接：`/register?aff_code={code}`。
- BFF：`GET /api/aff`（统计 + code）、`POST /api/aff`（划转）。
- **Backlog**：Dashboard 展示链接、`aff_count`、`aff_quota`、划转按钮。

### 5.4 计费

- 兑换/支付：纯代理；到账以刷新后 `GET /api/user/self` 为准。
- 无上游订单 API 前：充值页不展示伪造订单历史。

### 5.5 Dashboard 摘要

- `GET /api/dashboard/summary`：NewAPI `self` + checkin + quota 配置；Portal 仅会话绑定信息。
- **禁止**从 Portal DB 读额度或签到真源。

---

## 6. 验收标准（§7 定稿）

| # | 条件 | 状态 |
|---|------|------|
| 1 | Prisma 无 Checkin/Referral/Order/WalletLedger | ✅ |
| 2 | 用户热路径不调用 `POST /api/user/manage` | ✅ |
| 3 | 签到/计费后余额与 NewAPI `self.quota` 一致 | ✅ 签到 staging 已验；兑换/支付按需抽检 |
| 4 | Portal 创建的 Token 在 NewAPI 可见且 group 正确 | ✅ MVP 未回归破坏；发布前抽检 |
| 5 | `newapi-contract.md` 覆盖 BFF 依赖端点 | ✅ |
| 6 | 根目录 README 架构约束与实现一致 | ✅ |

**架构层「纯 UI 壳」：达标。**  
**产品层完整度**：邀请返利 Dashboard UI、支付订单历史依赖上游 API — 见 §8 backlog。

---

## 7. 部署与运维

1. **数据库**：部署前执行 `pnpm prisma:migrate`（含 `20260610120000_phase5_schema_cleanup`）。
2. **环境变量**：见 `newapi-portal/.env.example`；Admin Token 仅 seed/脚本需要。
3. **Staging 验证**：
   ```bash
   cd newapi-portal
   E2E_BASE_URL=https://test.easyapi.work \
   E2E_PORTAL_IDENTIFIER=... \
   E2E_PORTAL_PASSWORD=... \
   pnpm test:e2e:checkin
   ```
4. **诊断**：[checkin-diagnostics.md](./checkin-diagnostics.md)、[test-deploy-easyapi-portal.md](./test-deploy-easyapi-portal.md)

---

## 8. Backlog（非壳化阻塞）

| 优先级 | 项 | 说明 |
|--------|-----|------|
| P1 | 邀请返利 Dashboard UI | 消费已有 `/api/aff` |
| P2 | 支付订单历史 | 需 NewAPI 订单列表 API，或继续「仅刷新余额」 |
| P2 | Access token 定期刷新 | 评估 `GET /api/user/token` |
| P3 | 签到日历 / Turnstile UI | 体验增强；BFF 已支持 turnstile |
| P3 | 清理 dead export | `adminAddQuota`、`loginUser` 移入 scripts 或标注 ops-only |

---

## 9. 明确不做

- NewAPI 管理后台嵌入
- Portal 独立计费引擎 / 额度账本
- 2FA 登录流程
- `inviteCode` URL 兼容
- Portal 接收支付 notify
- 深色模式等（见 [easyapi-model-access-prd.md](./easyapi-model-access-prd.md)）

---

## 10. 参考

- [NewAPI 用户模块](https://doc.newapi.pro/en/api/fei-user/)
- [NewAPI Check-in PR #2565](https://github.com/QuantumNous/new-api/pull/2565)
- [newapi-contract.md](./newapi-contract.md)
- [portal-ui-shell-ui-changes.md](./portal-ui-shell-ui-changes.md)
- [checkin-diagnostics.md](./checkin-diagnostics.md)
- [test-deploy-easyapi-portal.md](./test-deploy-easyapi-portal.md)

---

## 附录 A — v1.0 → v2.0 变更摘要

| v1.0（规划） | v2.0（定稿） |
|--------------|--------------|
| Phase 1–5 待办 | Phase 1–5 **已完成**（代码 + migration） |
| `inviteCode` 兼容一版 | **已移除** |
| 2FA「补齐或标注不支持」 | **明确不支持** |
| §3.2 待迁移列表 | 改为 §4 已交付 + §8 backlog |
| 签到 UI 须日历 | 日历 **backlog**；Toast 展示额度 **已做** |

---

*v2.0：壳化架构交付定稿；迁移 PRD 转为运行态规范与 backlog。*
