# 签到（Check-in）与诊断验收

**状态：** 已验收（2026-06-10，[workflow run #27227828004](https://github.com/K4F7/easyapi/actions/runs/27227828004) 全绿，`quotaApplied: true`）  
**关联：** [easyapi-model-access-prd.md](./easyapi-model-access-prd.md)

---

## 目标

用户每日签到后，门户应：

1. 通过 BFF 代理 `POST /api/user/checkin`（NewAPI 原生签到，不再写 Portal `Checkin` / `WalletLedger`）
2. 额度由 NewAPI 直接增加到 `GET /api/user/self.quota`
3. `GET /api/dashboard/summary` 的 `checkin` 字段来自 `GET /api/user/checkin?month=`（含 `checkedInToday`、`quotaApplied`）

签到**不阻塞**常规 Portal 发布门禁（`portal-cd` / `test:e2e:ci`）；由独立 workflow 对 **staging** 做端到端诊断。

---

## 请求链路（与线上一致）

```
浏览器 / Playwright
  → https://test.easyapi.work/api/checkin   （Portal BFF，同源）
  → staging Portal 服务端
       · NewAPI：POST /api/user/checkin（用户态 token，走服务器 NEWAPI_BASE_URL）
  → 返回 { quotaApplied: true, quotaAmount, ... }
```

前端**从不**直连 NewAPI；`NEXT_PUBLIC_NEWAPI_BASE_URL` 仅用于 Dashboard 展示可复制 API 地址。

---

## 已完成（Portal 代码）

| 项 | 说明 |
|----|------|
| BFF 路由 | `POST /api/checkin` — `newapi-portal/src/app/api/checkin/route.ts` |
| 上游客户端 | `doCheckin` / `getCheckinStatus` — `newapi-portal/src/lib/newapi/checkin.ts` |
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

**staging 侧**（`portal-test` 容器 / compose）须已配置：

| 变量 / 上游 | 说明 |
|-------------|------|
| `NEWAPI_BASE_URL` | BFF 调 NewAPI 的上游（通常为同栈 Docker 内网） |
| NewAPI `checkin_enabled` | 在 NewAPI 运营设置中启用签到；未启用时 Portal 隐藏签到入口 |

---

## 运维注意

签到由 NewAPI 原生 API 直接发放额度，**不依赖** `NEWAPI_ADMIN_TOKEN`。若 `POST /api/checkin` 失败，优先检查：

1. NewAPI 运营设置中 `checkin_enabled` 是否为 true（`GET /api/status` → `checkin_enabled`）
2. NewAPI 版本是否含 check-in API（PR #2565）
3. 用户 `access_token` 是否有效（`NEWAPI_BINDING_*` / 重新登录）

---

## 如何运行

### GitHub Actions（推荐）

1. 确认 `https://test.easyapi.work` 已部署且 health 正常
2. 确认 staging `portal-test` 已配置 `NEWAPI_BASE_URL` 且上游 `checkin_enabled` 为 true
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
4. `GET /api/dashboard/summary`（签到后）：`checkedInToday`、`quotaApplied` 为 true
5. 控制台输出 `checkin diagnostics` JSON

---

## 验收清单

- [x] staging `portal-test` 配置 `NEWAPI_BASE_URL`（内网上游）且上游 `checkin_enabled` 为 true
- [x] `checkin-diagnostics` workflow 手动触发全绿
- [x] 日志中 `quotaApplied: true`；必要时在 NewAPI 后台核对测试用户额度变化

---

## 相关文件

| 类型 | 路径 |
|------|------|
| API | `newapi-portal/src/app/api/checkin/route.ts` |
| 上游客户端 | `newapi-portal/src/lib/newapi/checkin.ts` |
| E2E | `newapi-portal/tests/e2e/checkin-diagnostics.spec.ts` |
| Workflow | `.github/workflows/checkin-diagnostics.yml` |
| Staging 部署 | [test-deploy-easyapi-portal.md](./test-deploy-easyapi-portal.md) |

