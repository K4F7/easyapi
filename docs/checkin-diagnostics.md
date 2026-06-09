# 签到（Check-in）与诊断验收

**状态：** 已验收（2026-06-10，[workflow run #27227828004](https://github.com/K4F7/easyapi/actions/runs/27227828004) 全绿，`quotaApplied: true`）  
**关联：** [easyapi-model-access-prd.md](./easyapi-model-access-prd.md)

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

## 运维注意

`portal-test` 的 `NEWAPI_ADMIN_TOKEN` 须与 staging NewAPI 根用户 `access_token` 一致（写入服务器 `/opt/easyapi-portal-test/.env`，compose 通过 `${NEWAPI_ADMIN_TOKEN}` 注入）。若仍为默认 `replace-me`，`POST /api/checkin` 会 502 `CHECKIN_QUOTA_APPLY_FAILED`。

> 注：E2E 种子用户若当日已签到，用例仍应通过（幂等 / 重试发额度）；若仅 DB 有记录但额度未发放，会走 BFF 重试逻辑。

**GHA 不会把 `STAGING_NEWAPI_ADMIN_TOKEN` 写入服务器 `.env`**。该 Secret 仅用于 seed 脚本的 admin fallback；签到实际使用的是服务器 `/opt/easyapi-portal-test/.env` 里的 `NEWAPI_ADMIN_TOKEN`。

---

## 故障排查：签到失败 / 重试仍失败

### 典型现象

| 用户侧 | API / 诊断 |
|--------|------------|
| 首次点击 toast「签到失败」或「额度发放失败」 | `POST /api/checkin` → **502** |
| Dashboard 显示「签到成功，余额发放中」+「重试发放」 | `quotaPending: true`，`quotaApplied: false` |
| 多次重试仍失败 | 同上，502 不变 |

`checkin-diagnostics` 或浏览器 Network 中失败响应示例：

```json
{
  "ok": false,
  "error": {
    "code": "CHECKIN_QUOTA_APPLY_FAILED",
    "details": {
      "upstreamStatus": 200,
      "upstreamMessage": "Unauthorized, invalid access token"
    }
  }
}
```

### 根因

**不是 Portal 代码逻辑问题**，而是 `NEWAPI_ADMIN_TOKEN` 与 NewAPI 数据库里根用户（通常 `users.id = 1`）的 `access_token` **不一致**。

常见触发场景：

1. **`dev` 分支 CD 从生产快照恢复 Postgres**（[`restore-staging-production-db.sh`](../scripts/restore-staging-production-db.sh)）— 库里的 `access_token` 变了，但 `/opt/easyapi-portal-test/.env` 未同步。
2. 手动在 NewAPI 后台重置了根用户 token，未更新 `.env`。
3. `.env` 仍为 compose 默认值 `replace-me`。

Portal CD **只 recreate 容器、不修改 `.env`**，因此 token 漂移后每次部署都会继续失败。

### 在服务器上修复（staging）

主机：`45.142.115.128`，目录：`/opt/easyapi-portal-test`。

```bash
ssh root@45.142.115.128

# 1. 对比 .env 与 DB 中的 token 是否一致（只输出是否匹配，不打印 token）
ENV_TOKEN=$(grep ^NEWAPI_ADMIN_TOKEN= /opt/easyapi-portal-test/.env | cut -d= -f2- | tr -d "\"'")
DB_TOKEN=$(docker exec easyapi-portal-postgres-test psql -U newapi -d new-api -tAc \
  "SELECT access_token FROM users WHERE id=1;" | tr -d '\r\n')
[ "$ENV_TOKEN" = "$DB_TOKEN" ] && echo "token OK" || echo "token MISMATCH — run step 2"

# 2. 从 DB 同步到 .env 并重建 portal-test
DB_TOKEN=$(docker exec easyapi-portal-postgres-test psql -U newapi -d new-api -tAc \
  "SELECT access_token FROM users WHERE id=1;" | tr -d '\r\n')
ENV_FILE=/opt/easyapi-portal-test/.env
cp "$ENV_FILE" "${ENV_FILE}.bak-$(date +%Y%m%d%H%M%S)"
sed -i "s|^NEWAPI_ADMIN_TOKEN=.*|NEWAPI_ADMIN_TOKEN=${DB_TOKEN}|" "$ENV_FILE"

cd /opt/easyapi-portal-test
docker compose -p easyapi-portal -f docker-compose.easyapi-portal-test.yml \
  up -d --no-deps --force-recreate portal-test

# 3. 健康检查
curl -fsS https://test.easyapi.work/api/health
```

同步后建议把 GitHub Secret `STAGING_NEWAPI_ADMIN_TOKEN` 更新为同一 token（便于 seed admin fallback 与文档对照；**签到仍依赖服务器 `.env`**）。

### 验证修复

1. Actions → **Check-in diagnostics** → Run workflow  
2. 日志中 `postCheckin` 应为 2xx，且 `quotaApplied: true`、`quotaPending: false`  
3. 或在 Dashboard 对已 `quotaPending` 的账号点「重试发放」

2026-06-10 实例：诊断 run [#27227558733](https://github.com/K4F7/easyapi/actions/runs/27227558733) 失败（invalid access token）；服务器同步 token 后 [#27227828004](https://github.com/K4F7/easyapi/actions/runs/27227828004) 通过。

### 生产环境（easyapi.work）

若生产 Portal 也出现相同 502，在**对应生产服务器**上执行同样逻辑：从该环境 NewAPI Postgres 读取根用户 `access_token`，写入 Portal  compose 使用的 `.env`，再 `force-recreate` Portal 容器。生产路径与 staging 不同，勿直接复制 staging 的 token。

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

- [x] staging `portal-test` 配置 `NEWAPI_ADMIN_TOKEN` + `NEWAPI_BASE_URL`（内网上游）
- [x] `checkin-diagnostics` workflow 手动触发全绿
- [x] 日志中 `quotaApplied: true`；必要时在 NewAPI 后台核对测试用户额度变化

---

## 相关文件

| 类型 | 路径 |
|------|------|
| API | `newapi-portal/src/app/api/checkin/route.ts` |
| 额度 | `newapi-portal/src/lib/checkin/quota.ts` |
| E2E | `newapi-portal/tests/e2e/checkin-diagnostics.spec.ts` |
| Workflow | `.github/workflows/checkin-diagnostics.yml` |
| Staging 部署 | [test-deploy-easyapi-portal.md](./test-deploy-easyapi-portal.md) |

