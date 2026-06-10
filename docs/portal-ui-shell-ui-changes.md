# Portal UI 壳化重构 — UI 变更说明

**日期**: 2026-06-10  
**依据**: [portal-ui-shell-prd.md](./portal-ui-shell-prd.md)  
**范围**: 仅记录本次重构中**已修改**的前端页面；不包含 BFF / Prisma / 测试改动。

> **说明**：按产品要求，本次重构**不在 UI 上新增功能区块**（例如 PRD §5.3 提到的当月签到日历、Turnstile 控件、返利划转面板等均未加入）。下文列的是对**现有界面**的调整与删减。

---

## 1. 总览页 — `newapi-portal/src/app/dashboard/page.tsx`

### 改了什么

| 区域 | 变更 |
|------|------|
| 签到卡片 | 仅当 `summary.checkin.enabled === true` 时渲染；上游关闭签到功能时整块隐藏 |
| 签到状态 | 移除「余额待发放 / 重试发放」相关文案、Badge 变体与按钮逻辑（原 `quotaPending` 流程） |
| 签到说明 | 文案改为「奖励由 NewAPI 直接发放到账户」 |
| 签到 Toast | 重复签到时提示「今日已签到」，不再一律显示「签到完成」 |
| 快捷入口 | 「充值与兑换」描述由「查充值记录」改为「刷新余额」 |
| 类型定义 | `DashboardSummary.user` 去掉 `inviteCode` 字段（邀请码改由 `/api/aff` 提供，总览页未展示邀请区块故无可见字段变化） |

### 为什么改

- **Phase 1**：签到真源迁到 NewAPI 后，Portal 不再负责「admin 代发额度」；`quotaPending` / 「重试发放」是旧本地账本模型的 UI，继续保留会误导用户以为 Portal 还在发额度。
- **Phase 1 §5.3 / 配置**：`checkin_enabled === false` 时不应展示签到入口；用 `enabled` 门控比展示禁用按钮更符合 PRD。
- **Phase 2**：本地 `inviteCode` 废弃，用户对象不再携带该字段；总览页本身不渲染邀请链接，仅同步类型。
- **Phase 3**：本地 `Order` 表移除后不存在可靠充值历史，快捷文案不应再承诺「查充值记录」。

### 刻意未做的 UI（PRD 有提、本次未实现）

- 当月签到日历（`monthlyRecords`）
- 累计签到次数 / 本次奖励额度独立展示
- Turnstile 人机验证控件

API（`GET /api/dashboard/summary`）已具备部分数据，若后续需要可在**不扩布局**的前提下用现有卡片内文案呈现，或单独开需求。

---

## 2. 充值页 — `newapi-portal/src/app/dashboard/billing/page.tsx`

### 改了什么

| 区域 | 变更 |
|------|------|
| 余额统计区 | 由 3 列（可用余额 / 历史消耗 / **充值次数**）改为 2 列，去掉「充值次数」 |
| 数据加载 | 不再请求 `GET /api/billing/orders`；仅拉 `GET /api/dashboard/summary` 刷新余额 |
| 充值记录卡片 | 移除订单表格、Skeleton、状态 Badge（PAID/PENDING 等）；固定为 EmptyState「暂无充值记录」 |
| 发起支付 | 请求体去掉未使用的 `idempotencyKey` |
| 兑换码 | 到账展示仅用 `result.quotaAmount`，不再读 `result.ledger?.amount` |
| Toast | 支付返回：「正在刷新余额…」；创建支付：「支付链接已生成…」 |

### 为什么改

- **Phase 3**：计费真源在 NewAPI；Portal 的 `Order` 表已删除，`GET /api/billing/orders` 恒返回空列表。保留表格 + 「充值次数」会让用户以为 Portal 仍维护订单，且大量订单长期 PENDING 时体验更差。
- **Phase 3 验收**：「不得伪造 PAID 状态」—— 去掉本地订单 UI 是最直接做法；到账以刷新后 `GET /api/user/self` 余额为准（与 PRD §5.5 一致）。
- **Phase 3**：`WalletLedger` 已移除，兑换响应中的 `ledger` 字段不再存在；继续 fallback 会掩盖上游字段缺失。
- **实现清理**：`idempotencyKey` 从未转发到 NewAPI，属于无效前端字段。

### 用户可见影响

- 充值流程（填金额 → 跳转支付 → 返回刷新余额）**不变**。
- **无法再在本页查看历史订单**；需以后对接 NewAPI 订单 API 或接受「仅看余额」策略（PRD Phase 3 已接受）。

---

## 3. 注册页 — `newapi-portal/src/app/register/page.tsx`

### 改了什么

| 区域 | 变更 |
|------|------|
| URL 参数 | 读取顺序：`aff_code` → `inviteCode`（兼容旧链）→ `ref` |
| 表单字段 | 状态名 `inviteCode` → `affCode`；`id="affCode"` |
| 预填 | 若 URL 带上述参数，通过 `useEffect` 自动填入并转大写 |
| 提交 body | 字段由 `inviteCode` 改为 `affCode`（BFF 仍接受旧字段名一版） |
| 文案 | 标签「邀请码（aff_code）」；placeholder「如有 aff_code 可填写」 |

### 为什么改

- **Phase 2**：邀请体系统一为 NewAPI `aff_code`；链接格式应为 `/register?aff_code={code}`（PRD §5.4）。
- **兼容**：旧分享链接 `?inviteCode=` 仍可打开并预填，降低迁移期断链风险（PRD §6 兼容策略）。
- **数据流**：注册奖励与邀请关系由 NewAPI 在 `POST /api/user/register` 处理，Portal 不再校验本地 `inviteCode` 表。

### 用户可见影响

- 新邀请链接使用 `aff_code`；旧 `inviteCode` 链接短期仍可用。
- 字段标签更技术化（显式 `aff_code`），功能仍为可选邀请码。

---

## 4. 未改动的 UI 壳

以下文件/区域**本次未修改**（布局、导航、AuthShell、DashboardShell、各 dashboard 子页除上述三页外均保持原样）：

- `src/components/dashboard-shell.tsx`
- `src/components/dashboard-nav.tsx`
- `src/components/auth-shell.tsx`
- `src/app/dashboard/tokens|usage|playground|profile|docs/page.tsx`
- `src/app/login/page.tsx`、`src/app/page.tsx`（营销首页）

---

## 5. 与 PRD 的差异摘要

| PRD 要求 | 本次 UI 处理 |
|----------|----------------|
| 签到日历 / 统计展示（§5.3） | **未新增**；仅精简旧 Portal 签到 UI |
| 邀请返利展示与划转（§5.4） | **未新增**；注册页参数对齐 `aff_code`；Dashboard 返利卡片不在本次 diff |
| 订单历史（Phase 3） | **删减**表格，改为诚实空状态 |
| 深色模式等 | 仍不做（PRD §9） |

若需补全 PRD 中的体验层 UI（日历、返利控制台等），应作为**独立需求**评审，避免与「纯壳化、零本地真源」的后端迁移混在同一 PR。

---

## 6. 相关非 UI 改动（便于对照）

以下变更**不影响页面布局**，但会导致上述 UI 行为变化：

- BFF 签到 / 计费 / 注册路由改代理 NewAPI
- Prisma 删除 `Checkin`、`Referral`、`Order`、`WalletLedger`
- `PublicUser` 移除 `inviteCode`
- `GET /api/billing/epay/return` 改为 302 至 `/dashboard/billing?payment=return`

详见 [portal-ui-shell-prd.md](./portal-ui-shell-prd.md) 与各 Phase 验收项。
