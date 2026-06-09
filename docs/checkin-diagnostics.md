# 签到（Check-in）与诊断验收

**状态：** Portal 功能已合并；**独立 workflow 验收未完成**  
**关联：** [easyapi-model-access-prd.md](./easyapi-model-access-prd.md)（总览阻塞项）

---

## 目标

用户每日签到后，门户应：

1. 在 Portal 库记录当日签到（幂等，每人每天一次）
2. 通过 NewAPI 管理接口为用户发放 `CHECKIN_QUOTA` 额度
3. `GET /api/dashboard/summary` 反映 `checkedInToday`、`quotaApplied`、`quotaPending` 等状态

签到**不阻塞**常规 Portal 发布门禁（`portal-cd` / `test:e2e:ci`）；由独立 workflow 对 **staging** 做端到端诊断。

---

## 请求链路（与线上一致）

```
浏览器 / Playwright
  → https://test.easyapi.work/api/checkin   （Portal BFF，同源）
  → staging Portal 服务端
       · Prisma：checkin + walletLedger
       · NewAPI：POST /api/user/manage（adminAddQuota，走服务器 NEWAPI_BASE_URL）
  → 返回 { quotaApplied, ... }
```

前端**从不**直连 NewAPI；`NEXT_PUBLIC_NEWAPI_BASE_URL` 仅用于 Dashboard 展示可复制 API 地址。

---

## 已完成（Portal 代码）

| 项 | 说明 |
|----|------|
| BFF 路由 | `POST /api/checkin` — `newapi-portal/src/app/api/checkin/route.ts` |
| 额度发放 | `applyCheckinQuota` — `newapi-portal/src/lib/checkin/quota.ts` |
| Summary 展示 | `GET /api/dashboard/summary` 含 `checkin` 字段 |
| Dev Mock | `PORTAL_DEV_MOCK=1` 时可本地跑通签到逻辑 |
| 诊断 E2E | `tests/e2e/checkin-diagnostics.spec.ts` |
| 独立 Workflow | `.github/workflows/checkin-diagnostics.yml`（`workflow_dispatch`） |

---

## GHA 怎么测

Workflow **直接打 staging**，不在 runner 上自建 Portal：

| 项 | 值 |
|----|-----|
| 目标 | `https://test.easyapi.work` |
| 账号 | Secrets `E2E_PORTAL_IDENTIFIER` / `E2E_PORTAL_PASSWORD` |
| 命令 | `pnpm test:e2e:checkin` |

与 `portal-cd` 的 `verify_ui` 相同模式：preflight health + login，再 Playwright。

**staging 侧**（`portal-test` 容器 / compose）须已配置签到所需服务端变量，GHA **不**注入 `NEWAPI_BASE_URL` / `NEWAPI_ADMIN_TOKEN`：

| 变量 | 说明 |
|------|------|
| `NEWAPI_BASE_URL` | BFF 调 NewAPI 的上游（通常为同栈 Docker 内网，非公网展示域名） |
| `NEWAPI_ADMIN_TOKEN` | 签到 `adminAddQuota` 必需 |
| `NEWAPI_ADMIN_USER_ID` | 管理用户 ID |
| `CHECKIN_QUOTA` | 每次签到发放额度 |

---

## 未完成（验收项）

| 阻塞 | 负责 | 说明 |
|------|------|------|
| **staging `NEWAPI_ADMIN_TOKEN`** | DevOps | `portal-test` 未配置或无效时，`POST /api/checkin` 会 502 `CHECKIN_QUOTA_APPLY_FAILED` |
| **全流程绿灯** | — | 需一次成功的 [check-in diagnostics](https://github.com/K4F7/easyapi/actions/workflows/checkin-diagnostics.yml) run：`quotaApplied: true` 且 summary 一致 |

> 注：E2E 种子用户若当日已签到，用例仍应通过（幂等 / 重试发额度）；若仅 DB 有记录但额度未发放，会走 BFF 重试逻辑。

---

## 如何运行

### GitHub Actions（推荐）

1. 确认 `https://test.easyapi.work` 已部署且 health 正常
2. 确认 staging `portal-test` 已配置 `NEWAPI_ADMIN_TOKEN` 等（见上表）
3. 配置 Secrets：`E2E_PORTAL_IDENTIFIER`、`E2E_PORTAL_PASSWORD`
4. Actions → **Check-in diagnostics** → **Run workflow**

### 本地（对 staging）

```bash
cd newapi-portal
E2E_BASE_URL=https://test.easyapi.work \
E2E_PORTAL_IDENTIFIER=scr@qq.com \
E2E_PORTAL_PASSWORD='...' \
pnpm test:e2e:checkin
```

### 本地（Dev Mock）

```bash
PORTAL_DEV_MOCK=1 pnpm dev
pnpm test:e2e:checkin   # 需 E2E_BASE_URL 指向本地 dev 服务
```

---

## 诊断 E2E 断言要点

1. `GET /api/auth/me` 成功（API 登录或 cookie）
2. `GET /api/dashboard/summary`（签到前）可读
3. `POST /api/checkin` → 2xx，`data.quotaApplied === true`
4. `GET /api/dashboard/summary`（签到后）：`checkedInToday`、`quotaApplied` 为 true，`quotaPending` 为 false
5. 控制台输出 `checkin diagnostics` JSON

---

## 验收清单

- [ ] staging `portal-test` 配置 `NEWAPI_ADMIN_TOKEN` + `NEWAPI_BASE_URL`（内网上游）
- [ ] `checkin-diagnostics` workflow 手动触发全绿
- [ ] 日志中 `quotaApplied: true`；必要时在 NewAPI 后台核对测试用户额度变化

---

## 相关文件

| 类型 | 路径 |
|------|------|
| API | `newapi-portal/src/app/api/checkin/route.ts` |
| 额度 | `newapi-portal/src/lib/checkin/quota.ts` |
| E2E | `newapi-portal/tests/e2e/checkin-diagnostics.spec.ts` |
| Workflow | `.github/workflows/checkin-diagnostics.yml` |
| Staging 部署 | [test-deploy-easyapi-portal.md](./test-deploy-easyapi-portal.md) |
