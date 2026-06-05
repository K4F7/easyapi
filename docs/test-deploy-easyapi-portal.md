# EasyAPI Portal 测试环境部署手册

本文档描述 **staging 测试环境**（`https://test.easyapi.work`）的完整部署与截图流程。

> **硬性约束：服务器上所有 Docker 操作仅限 Compose 项目 `easyapi-portal`。**  
> 禁止修改或重启 `official-newapi`、`portal-migration-test` 等其他 compose 项目。

---

## 1. 概览

| 项目 | 值 |
|------|-----|
| 对外地址 | https://test.easyapi.work |
| 服务器 | `root@45.142.115.128` |
| 编排目录 | `/opt/easyapi-portal-test` |
| Compose 文件 | `docker-compose.easyapi-portal-test.yml` |
| Compose 项目名 | **`easyapi-portal`**（`-p easyapi-portal`） |
| Portal 服务名 | `portal-test` |
| Portal 端口 | `2333`（经反代对外为 443） |
| 镜像（main） | `ghcr.io/k4f7/easyapi/newapi-portal:test-latest` |
| 镜像（dev） | `ghcr.io/k4f7/easyapi/newapi-portal:dev-latest` |
| GHA CI（PR） | [`.github/workflows/portal-ci.yml`](../.github/workflows/portal-ci.yml) |
| GHA CD（push） | [`.github/workflows/portal-cd.yml`](../.github/workflows/portal-cd.yml) |
| 部署脚本 | [`scripts/deploy-portal-staging.sh`](../scripts/deploy-portal-staging.sh) |

**标准流程顺序：**

```
提 PR → portal-ci（lint / 单测 / Next 构建 / Docker 构建校验，不部署）
合并后 push dev/main → portal-cd（构建并推送镜像 → SSH 部署 → seed → verify_ui Playwright）
→ （本地可选）pnpm screenshots:e2e 生成截图
```

除 `dev` / `main` 外，`feat/ui-future-design` 推送也会触发 **CD**（构建、部署与 E2E）；其他 `feat/*` 分支默认不跑 CD，需开 PR 走 **CI** 或合并到上述分支后再部署。

`dev` 与 `main` 推送到默认会**自动部署** staging；仅改 `docs/` 等路径不会触发 CD。PR **不会**触发部署或 staging E2E。

---

## 1.1 PR 检查（CI）

工作流 **Portal CI**（[`portal-ci.yml`](../.github/workflows/portal-ci.yml)）在针对 `dev` / `main` 的 `pull_request` 且变更位于 `newapi-portal/**` 或上述 workflow 文件时运行：lint、typecheck、Vitest、`pnpm build`、Docker 镜像构建（`push: false`）。**不** SSH 部署、**不** seed、**不** 对 staging 跑 Playwright。

## 1.2 自动部署（CD）

工作流 **Portal staging CD**（[`portal-cd.yml`](../.github/workflows/portal-cd.yml)）仅在 `push` 到 `dev` / `main` / `feat/ui-future-design`（`paths-ignore` 排除仅 `docs/**` 变更）或带 **Deploy to staging** 的 `workflow_dispatch` 时运行：

| 分支 | 推送的镜像 tag | 部署到 staging |
|------|----------------|----------------|
| `dev` | `dev-latest`、`dev-<sha>` | 是：先**从生产快照恢复库**，再部署 `portal-test`，再 **seed** + **Playwright UI 验证** |
| `main` | `test-latest`、`test-<sha>` | 是：仅 `portal-test`（**不**重建库），同样 **seed** + **Playwright UI 验证** |

**dev 专用数据步骤**（每次 push `dev` 且触发 workflow 时）：

1. SSH 执行 [`scripts/restore-staging-production-db.sh`](../scripts/restore-staging-production-db.sh)：`down` → 删除 `easyapi-portal_pg_data_test` volume → 用服务器上的 `xbh-new-api-2026-05-23-172431.sql.gz` 重新 `up` 全栈  
2. 等待 `https://test.easyapi.work/api/health`  
3. 部署新 Portal 镜像（仅 `portal-test`）  
4. [`scripts/seed-staging-via-api.mjs`](../scripts/seed-staging-via-api.mjs) 注册/验证截图账号 `scr@easyapi.work` / `ScreenshotTest123!`（**dev 与 main 均执行**，幂等：已存在则仅验证登录）  
5. CI 内 POST login 校验该账号  
6. **`verify_ui` job**：先 curl 校验 E2E 账号可登录，再 `pnpm run test:e2e:ci`（[`ui-pages`](../newapi-portal/tests/e2e/ui-pages.spec.ts)、[`portal-smoke`](../newapi-portal/tests/e2e/portal-smoke.spec.ts)、[`playground`](../newapi-portal/tests/e2e/playground.spec.ts)、[`register-billing`](../newapi-portal/tests/e2e/register-billing.spec.ts)）；失败时上传 `playwright-report` artifact  

恢复库后会在 seed 前执行 [`scripts/configure-staging-registration.sh`](../scripts/configure-staging-registration.sh)（关闭邮箱域名限制等，**仅 dev**）。可选 Secrets：`STAGING_NEWAPI_BASE_URL`、`STAGING_NEWAPI_ADMIN_TOKEN`（注册失败时 admin fallback）。

### 自动 UI 验证覆盖

**路由可达性（10 个页面）** — 清单见 [`routes.ts`](../newapi-portal/tests/e2e/routes.ts)：

| 类型 | 路径 |
|------|------|
| 公开 | `/`、`/login`、`/register`、`/forgot-password` |
| 登录后 | `/dashboard`、`/dashboard/tokens`、`/dashboard/billing`、`/dashboard/usage`、`/dashboard/playground`、`/dashboard/profile` |

每条路由检查：关键标题/文案可见、无 5xx 响应、无页面级 JS 错误；dashboard 页额外断言无「加载失败」类错误文案。

**专项 E2E（`playground` + `register-billing` spec）** — 操练场 tab/URL/令牌脱敏与 Chat 交互（含 mock 流式）、注册自设密码与校验、财务页 `inviteCode` 邀请链接与奖励说明等；详见各 spec 文件内用例名。

`main` 部署不会清空测试库；若只需更新 Portal 代码用 `main`，需要可重复的生产+测试数据用 `dev`。

**注意**：每次 `dev` 部署会**清空并重建** staging Postgres（生产快照非实时同步）；`dev` 上在测试期间手工改库的数据会在下次 `dev` push 后丢失。

`workflow_dispatch` 默认只构建；勾选 **Deploy to staging after build** 才会执行部署 job（`dev` 分支手动触发时同样会恢复库+seed）。

### GitHub Secrets（仓库 Settings → Secrets）

| Secret | 说明 |
|--------|------|
| `STAGING_SSH_HOST` | `45.142.115.128` |
| `STAGING_SSH_USER` | `root` |
| `STAGING_SSH_PRIVATE_KEY` | 部署用 SSH 私钥（对应服务器 `authorized_keys`） |
| `GHCR_PULL_TOKEN`（可选） | 若服务器未持久 `docker login ghcr.io`，填只读 PAT（`read:packages`）；workflow 会传给部署脚本临时登录 |
| `E2E_PORTAL_IDENTIFIER`（推荐） | `scr@easyapi.work`；未配置时 CI 使用文档默认账号 |
| `E2E_PORTAL_PASSWORD`（推荐） | `ScreenshotTest123!`；未配置时 CI 使用文档默认密码 |
| `STAGING_NEWAPI_BASE_URL`（可选） | seed admin fallback 用 NewAPI 地址 |
| `STAGING_NEWAPI_ADMIN_TOKEN`（可选） | seed admin fallback 用管理 token |

### GitHub Variables（仓库 Settings → Variables）

这些值是公开配置，供前端 build-time 与容器 runtime 使用，**不要放到 Secrets**：

| Variable | 用途 | 示例 |
|----------|------|------|
| `STAGING_IMAGE_PLAYGROUND_URL` | 独立部署的生图 Playground iframe 地址；Docker build 时写入 `NEXT_PUBLIC_IMAGE_PLAYGROUND_URL`，部署时也作为 Portal runtime CORS allowlist 来源 | `https://image.easyapi.work` |
| `STAGING_PUBLIC_NEWAPI_BASE_URL` | 前端可见的 NewAPI 公网地址；Docker build 时写入 `NEXT_PUBLIC_NEWAPI_BASE_URL` | `https://api.easyapi.work` |

**build-time 与 runtime 区别：**

- `NEXT_PUBLIC_IMAGE_PLAYGROUND_URL`、`NEXT_PUBLIC_NEWAPI_BASE_URL` 会在 `pnpm build` 时被 Next.js 内联进前端 bundle；修改后必须重新构建镜像。
- `IMAGE_PLAYGROUND_ALLOWED_ORIGIN` / `IMAGE_PLAYGROUND_URL` 是 Portal 服务端运行时变量，用于 `/v1/images/generations` 与 `/api/playground/images/generations` 的 CORS 判断；修改后只需 recreate `portal-test`。
- GHA 的 Docker build 已通过 `build-args` 传入 `STAGING_IMAGE_PLAYGROUND_URL`、`STAGING_PUBLIC_NEWAPI_BASE_URL`；Deploy job 会把 `IMAGE_PLAYGROUND_ALLOWED_ORIGIN`、`IMAGE_PLAYGROUND_URL` 传给 SSH 部署脚本。服务器 compose 仍必须显式把这些变量写入 `portal-test.environment`，否则容器拿不到运行时变量。

查看运行状态：

```bash
gh run list --repo K4F7/easyapi --workflow "Portal CI" --limit 5
gh run list --repo K4F7/easyapi --workflow "Portal staging CD" --limit 5
gh run watch <run-id> --repo K4F7/easyapi --exit-status
```

### 服务器 compose 前置（一次性）

`portal-test` 的 `image` 必须支持环境变量覆盖，否则 dev 部署仍会使用写死的 `test-latest`：

```yaml
portal-test:
  image: ${PORTAL_IMAGE:-ghcr.io/k4f7/easyapi/newapi-portal:test-latest}
  environment:
    # 其他 DATABASE_URL / AUTH_SECRET / NEWAPI_* 等既有变量保持不变。
    IMAGE_PLAYGROUND_ALLOWED_ORIGIN: ${IMAGE_PLAYGROUND_ALLOWED_ORIGIN:-}
    IMAGE_PLAYGROUND_URL: ${IMAGE_PLAYGROUND_URL:-}
```

部署时 CI 与手动脚本都会 `export PORTAL_IMAGE=...` 再执行 `docker compose up`。生图 iframe 若跨域部署，`IMAGE_PLAYGROUND_ALLOWED_ORIGIN` 必须等于 iframe 页面发起请求时的 `Origin`（通常就是 `STAGING_IMAGE_PLAYGROUND_URL` 的 origin）；可用逗号分隔多个 origin。

### image.easyapi.work 反代与安全头（1Panel openresty）

staging 上生图 Playground 容器为 `easyapi-portal-image-playground-test`（`127.0.0.1:2334` → 公网 `https://image.easyapi.work`）。openresty 由 **1Panel** 管理，站点配置在宿主机：

| 路径 | 说明 |
|------|------|
| `/opt/1panel/www/sites/image.easyapi.work/proxy/root.conf` | 反代到 `127.0.0.1:2334` 的 `location` |
| openresty 容器 | `1Panel-openresty-1TFn` |

**必须**在 `root.conf` 的 `location` 内加入 embed 安全头，仅允许 Portal 域 iframe 嵌入，并避免缓存带 token 的 URL：

```nginx
proxy_hide_header Referrer-Policy;
add_header Content-Security-Policy "frame-ancestors https://test.easyapi.work https://easyapi.work" always;
add_header Cache-Control "no-store" always;
add_header Referrer-Policy "no-referrer" always;
```

一键应用（在 staging 主机或本机 SSH 管道执行）：

```bash
ssh root@45.142.115.128 'bash -s' < scripts/configure-image-playground-openresty.sh
```

验证：

```bash
curl -sI https://image.easyapi.work/ | grep -iE 'content-security-policy|cache-control|referrer-policy'
```

期望包含：

```text
content-security-policy: frame-ancestors https://test.easyapi.work https://easyapi.work
cache-control: no-store
referrer-policy: no-referrer
```

说明：`frame-ancestors` 限制「谁可以 iframe 嵌入」，**不能**阻止用户在地址栏直接打开 `https://image.easyapi.work/`。

### 生图 Playground 认证与代理边界

Portal 提供两个兼容代理入口：

- `/api/playground/images/generations`
- `/v1/images/generations`

`/v1/images/generations` 是为 iframe 中 OpenAI-compatible 客户端保留的兼容代理，**不是公开 OpenAI API**。它只接受 Portal 签发的短期 image session token，或同源已有登录 session + body `tokenId` 的兼容请求。

上线后的 iframe 认证流程：

1. 登录用户进入 `/dashboard/playground?tab=image`，前端用当前同源 session 调用 `/api/playground/images/session`。
2. Portal 服务端用 `AUTH_SECRET` 签发短期 `portal-image-session-v1.*` token；payload 只绑定 Portal `userId`、选中的 `tokenId`、`iat`、`exp`、`aud`，不包含真实 NewAPI key。
3. 前端把该签名 token 作为 iframe URL 参数 `apiKey` / `playgroundSessionToken` 传入独立 Playground。
4. iframe 调用 Portal 的 image generation 代理时，可用 `Authorization: Bearer <portal-image-session-v1.*>`、body `playgroundSessionToken` 或 query `playgroundSessionToken` 携带该 token。
5. Portal 验签、校验过期时间，再按绑定用户与 selected token id 在服务端解析真实 NewAPI key 并转发到 NewAPI；真实 key 不进入 iframe URL、浏览器日志或响应体。

同源兼容路径仍保留：Portal 自己的测试或同源客户端可以在已有登录 session 下传 body `tokenId`，但跨站 iframe 上线不要依赖第三方 cookie。

### GHCR 拉取（服务器）

任选其一：

- **A（推荐）**：在服务器执行一次 `docker login ghcr.io`（read-only PAT，`read:packages`）。
- **B**：配置 Secret `GHCR_PULL_TOKEN`；部署脚本在 pull 前临时登录（`GHCR_PULL_USER` 默认为仓库 owner）。

### 手动 / 应急部署

与 CI 相同逻辑，可在本机通过 SSH 调用仓库脚本：

```bash
export PORTAL_IMAGE=ghcr.io/k4f7/easyapi/newapi-portal:dev-latest   # 或 test-latest
export IMAGE_PLAYGROUND_ALLOWED_ORIGIN=https://image.easyapi.work
export IMAGE_PLAYGROUND_URL=https://image.easyapi.work
ssh root@45.142.115.128 'bash -s' < scripts/deploy-portal-staging.sh
```

staging 仅有一个 `portal-test` 实例：`dev` 与 `main` 若连续部署，**后完成的一次**生效。

部署成功后，GHA **`verify_ui`** 与本地 Playwright 均通过公网访问 `test.easyapi.work`；seed 脚本通过 HTTPS 调用 Portal API，无需 SSH 进容器写库。

本地快速复现 CI 界面检查：

```bash
cd newapi-portal
export E2E_BASE_URL="https://test.easyapi.work"
export E2E_PORTAL_IDENTIFIER="scr@easyapi.work"
export E2E_PORTAL_PASSWORD="ScreenshotTest123!"
pnpm install
npx playwright install chromium
pnpm test:ui
```

---

## 2. 测试用户凭据（必填）

截图与 E2E 登录使用以下固定账户：

| 字段 | 值 |
|------|-----|
| **邮箱 / 登录名** | `scr@easyapi.work` |
| **密码** | `ScreenshotTest123!` |

### 为何使用短邮箱

Portal 注册时会把邮箱作为 NewAPI 的 `username`。NewAPI **用户名最长 20 字符**：

- `scr@easyapi.work` = 16 字符 ✅
- `screenshot-test@easyapi.work` = 28 字符 ❌（注册会失败）

### 相关环境变量

在 `newapi-portal/.env` 或运行命令前导出：

```bash
E2E_PORTAL_IDENTIFIER="scr@easyapi.work"
E2E_PORTAL_PASSWORD="ScreenshotTest123!"
SEED_EMAIL="scr@easyapi.work"
SEED_PASSWORD="ScreenshotTest123!"
SEED_BASE_URL="https://test.easyapi.work"   # seed 脚本目标地址
E2E_BASE_URL="https://test.easyapi.work"    # Playwright baseURL
```

脚本默认值已与上表一致，见 [`newapi-portal/.env.example`](../newapi-portal/.env.example)。

---

## 3. 测试数据库备份

### 源备份（生产快照）

| 位置 | 说明 |
|------|------|
| 工作区根目录 | `xbh-new-api-2026-05-23-172431.sql.gz` |
| 服务器 | `/opt/easyapi-portal-test/xbh-new-api-2026-05-23-172431.sql.gz` |

首次初始化 Postgres 时，compose 通过环境变量 `BACKUP_SQL_GZ` 导入该文件。

### 已 seed 的导出（含截图测试用户）

| 位置 | 说明 |
|------|------|
| 本地 | `test-data/easyapi-portal-with-screenshot-user.sql.gz` |
| Git | **已 gitignore**（`test-data/*.sql.gz`），不提交仓库 |

恢复时可在服务器设置：

```bash
export BACKUP_SQL_GZ=/opt/easyapi-portal-test/easyapi-portal-with-screenshot-user.sql.gz
```

### 准备脚本（远程执行，非本地 Docker）

在 **`newapi-portal`** 目录运行：

```bash
cd newapi-portal
pnpm prepare:test-db
```

脚本 [`scripts/prepare-test-database.mjs`](../scripts/prepare-test-database.mjs) 会：

1. SSH 到 `45.142.115.128`，在 **`easyapi-portal`** 项目内 down → 删除 `easyapi-portal_pg_data_test` volume → 用源备份重建栈
2. 等待 `https://test.easyapi.work/api/health` 就绪
3. 调用 seed 脚本创建 `scr@easyapi.work`
4. `pg_dump` 导出到本地 `test-data/easyapi-portal-with-screenshot-user.sql.gz`

可选环境变量：`PREPARE_REMOTE_HOST`、`PREPARE_REMOTE_DIR`、`PREPARE_COMPOSE_PROJECT`、`SEED_BASE_URL`。

---

## 4. 部署流程（逐步）

### 步骤 1：推送代码（CD 构建 + 自动部署）

```bash
git push origin dev    # 镜像 dev-latest，自动部署 staging
# 或
git push origin main   # 镜像 test-latest，自动部署 staging
```

工作流会构建、推送镜像，SSH 仅重建 `portal-test`，并在 runner 上轮询 `https://test.easyapi.work/api/health`。

若 CI 未跑（例如只改了文档），或需回滚到指定 tag，使用 [§1.1 手动 / 应急部署](#11-自动部署ci) 或下方步骤 2。

查看 CI 状态见 §1.1。

### 步骤 2：手动 SSH 部署（应急，与 CI 等价）

```bash
export PORTAL_IMAGE=ghcr.io/k4f7/easyapi/newapi-portal:test-latest   # main；dev 用 dev-latest
ssh root@45.142.115.128 'bash -s' < scripts/deploy-portal-staging.sh
```

或在服务器上（需已将 `scripts/deploy-portal-staging.sh` 同步到该机，或粘贴脚本内容）：

```bash
ssh root@45.142.115.128
export PORTAL_IMAGE=ghcr.io/k4f7/easyapi/newapi-portal:test-latest
cd /opt/easyapi-portal-test
docker pull "${PORTAL_IMAGE}"
docker compose -p easyapi-portal -f docker-compose.easyapi-portal-test.yml \
  up -d --no-deps --force-recreate portal-test
```

说明：

- **只 recreate `portal-test`**，不要 `down` 整个栈，不要动 `postgres-test`、`new-api-test`、`redis-test`
- **不要**对其他 compose 项目执行任何命令

### 步骤 3：Health check

```bash
curl -s https://test.easyapi.work/api/health
```

期望返回 JSON 且 `"ok": true`，例如：

```json
{"ok":true}
```

### 步骤 4：Seed 截图测试用户（本地；CI 在 deploy 后已自动 seed）

在本地 **`newapi-portal`** 目录（部署完成且 health 正常后）：

```bash
cd newapi-portal
pnpm seed:screenshot-user
```

脚本会调用 `https://test.easyapi.work/api/auth/register`；若用户已存在则验证登录。失败时可设置 `NEWAPI_BASE_URL` + `NEWAPI_ADMIN_TOKEN` 走 admin 回退（见 [`scripts/seed-screenshot-user.mjs`](../newapi-portal/scripts/seed-screenshot-user.mjs)）。

### 步骤 5：Playwright 全站截图

**必须在步骤 2 新镜像已部署且 health 正常之后执行。**

```bash
cd newapi-portal
pnpm install
npx playwright install chromium   # 首次需要

pnpm screenshots:e2e
```

输出目录：`newapi-portal/screenshots/<YYYY-MM-DD>/`（9 张 PNG：4 个公开页 + 5 个 dashboard 页，含 `/forgot-password` 与 `/dashboard/profile`）。

### 步骤 6：生图 Playground 上线验证

当 `STAGING_IMAGE_PLAYGROUND_URL` 已配置时，`verify_ui` 中的 [`playground.spec.ts`](../newapi-portal/tests/e2e/playground.spec.ts) 会断言：

- `/dashboard/playground?tab=image` 必须出现 `iframe[title="生图 Playground"]`，不能退化为「未配置」提示。
- iframe URL 必须包含 `apiUrl` / `baseUrl` / `imageApiUrl` 指向 Portal 本域代理。
- iframe URL 的 `apiKey` / `playgroundSessionToken` 必须是 `portal-image-session-v1.*` 签名 token，不能出现真实 `sk-*`，也不能再使用 `portal-token-<id>` 这类裸 tokenId marker。

手动检查 CORS preflight（把 origin 替换成真实 `STAGING_IMAGE_PLAYGROUND_URL` 的 origin）：

```bash
curl -i -X OPTIONS "https://test.easyapi.work/v1/images/generations" \
  -H "Origin: https://image.easyapi.work" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

期望响应包含：

```text
HTTP/2 204
access-control-allow-origin: https://image.easyapi.work
access-control-allow-headers: Content-Type, Authorization
access-control-allow-credentials: true
```

如果没有 `access-control-allow-origin`，优先检查服务器 compose 是否已把 `IMAGE_PLAYGROUND_ALLOWED_ORIGIN` 注入 `portal-test` 容器，而不是只配置了 build-time 的 `NEXT_PUBLIC_IMAGE_PLAYGROUND_URL`。

---

## 5. npm 脚本参考

均在 **`newapi-portal`** 目录下执行（`pnpm <script>`）：

| 脚本 | 作用 |
|------|------|
| `test:e2e:ci` | 与 GHA `verify_ui` 相同：ui-pages + smoke + playground + register-billing |
| `test:ui` | 全站界面可达性（10 页，与 CI `ui-pages` spec 一致） |
| `test:e2e:playground` | 仅操练场 spec |
| `test:e2e:register-billing` | 仅注册 + 财务邀请 spec |
| `test:e2e` | 全部 Playwright spec（含 screenshots，本地/手工用） |
| `seed:screenshot-user` | 对 `SEED_BASE_URL`（默认 staging）注册/验证 `scr@easyapi.work` |
| `prepare:test-db` | SSH 远程重建 easyapi-portal 测试库、seed、导出 `test-data/*.sql.gz` |
| `screenshots:e2e` | 仅运行 Playwright 截图 spec（需已部署新镜像 + 测试用户可登录） |
| `screenshots:all` | `seed:screenshot-user` 然后 `screenshots:e2e`（一条龙；仍须先完成 GHA + 服务器部署） |

相关文件：

- 路由清单：[`newapi-portal/tests/e2e/routes.ts`](../newapi-portal/tests/e2e/routes.ts)
- UI 验证：[`newapi-portal/tests/e2e/ui-pages.spec.ts`](../newapi-portal/tests/e2e/ui-pages.spec.ts)
- Smoke：[`newapi-portal/tests/e2e/portal-smoke.spec.ts`](../newapi-portal/tests/e2e/portal-smoke.spec.ts)
- 操练场：[`newapi-portal/tests/e2e/playground.spec.ts`](../newapi-portal/tests/e2e/playground.spec.ts)
- 注册/财务：[`newapi-portal/tests/e2e/register-billing.spec.ts`](../newapi-portal/tests/e2e/register-billing.spec.ts)
- Seed：[`newapi-portal/scripts/seed-screenshot-user.mjs`](../newapi-portal/scripts/seed-screenshot-user.mjs)
- 截图 spec：[`newapi-portal/tests/e2e/screenshots.spec.ts`](../newapi-portal/tests/e2e/screenshots.spec.ts)
- Playwright 配置：[`newapi-portal/playwright.config.ts`](../newapi-portal/playwright.config.ts)

---

## 6. 故障排查

### CI `verify_ui` 失败

1. 在 Actions 中打开 **Verify portal UI on staging** job，下载 `playwright-report` artifact（含 trace / 截图）。
2. 确认 **Deploy** job 中 seed 与 login 校验已通过。
3. 本地用相同凭据执行 `pnpm run test:e2e:ci`（或拆分 `test:ui` / `test:e2e:playground` / `test:e2e:register-billing`）复现。
4. 若仅 `main` 失败且为登录问题，检查 `STAGING_NEWAPI_*` Secrets 是否可用于 seed admin fallback。

### CI 部署失败：SSH / pull / health

1. 在 GitHub Actions 查看 **Deploy portal-test to staging** job；失败时 **Collect portal logs** 步骤会拉取 `easyapi-portal-portal-test` 最近日志。
2. 确认仓库 Secrets：`STAGING_SSH_HOST`、`STAGING_SSH_USER`、`STAGING_SSH_PRIVATE_KEY`。
3. 确认服务器能 `docker pull`（`docker login ghcr.io` 或配置 `GHCR_PULL_TOKEN`）。
4. 确认 `portal-test` 使用 `${PORTAL_IMAGE:-...}`（见 §1.1）。

### GHA 构建失败：`ERR_PNPM_OUTDATED_LOCKFILE`

Dockerfile 使用 `pnpm install --frozen-lockfile`。若 `package.json` 与 `pnpm-lock.yaml` 不同步，构建会失败。

修复：

```bash
cd newapi-portal
pnpm install
git add pnpm-lock.yaml
git commit -m "Sync pnpm lockfile for portal image build"
git push origin main
```

然后重新等待 GHA 成功再部署。

### 注册失败：邮箱域名限制

NewAPI 选项 `EmailDomainRestrictionEnabled=true` 时，只允许特定域名注册。测试环境需允许 `@easyapi.work`，或在 Postgres 中关闭限制（**仅限 easyapi-portal 测试库**）：

```bash
docker exec easyapi-portal-postgres-test psql -U newapi -d new-api -c \
  "UPDATE options SET value = 'false' WHERE key = 'EmailDomainRestrictionEnabled';"
docker compose -p easyapi-portal -f /opt/easyapi-portal-test/docker-compose.easyapi-portal-test.yml \
  restart new-api-test portal-test
```

同时确认 `RegisterEnabled=true`，且测试邮箱使用 `@easyapi.work` 域名。

### 注册失败：用户名超过 20 字符

错误表现：NewAPI 返回注册失败 / Portal 500。  
解决：使用 `scr@easyapi.work`（16 字符），不要用 `screenshot-test@easyapi.work` 等长邮箱。

### 注册失败：邮箱验证 / Turnstile

若 `EmailVerificationEnabled` 或 `TurnstileCheckEnabled` 为 true，API 注册可能失败。测试库可关闭（同上，改 `options` 表后 restart `new-api-test`）。

### 误操作其他 compose 项目

**禁止**在以下项目执行 pull / down / up：

- `official-newapi`
- `portal-migration-test`
- 任何非 `easyapi-portal` 的 `-p` 项目名

所有命令必须带：

```bash
docker compose -p easyapi-portal -f /opt/easyapi-portal-test/docker-compose.easyapi-portal-test.yml ...
```

### 截图失败但 staging 可访问

1. 确认 GHA 已成功且 `portal-test` 已 `--force-recreate`
2. 确认 `pnpm seed:screenshot-user` 输出 login verified
3. 确认 Playwright 使用的 heading 文案与**当前部署版本**一致（见 `screenshots.spec.ts`）
4. 查看 `newapi-portal/test-results/` 与 `playwright-report/` 中的 trace

### Health check 长时间不通过

```bash
ssh root@45.142.115.128
docker logs easyapi-portal-portal-test --tail 50
docker compose -p easyapi-portal -f /opt/easyapi-portal-test/docker-compose.easyapi-portal-test.yml ps
```

常见原因：镜像 pull 失败、Prisma migrate 报错、Postgres 未就绪（仅 recreate portal 时较少见）。

---

## 快速检查清单

- [ ] `dev` 或 `main` 已 push（`newapi-portal/` 有变更），GHA **Portal staging CD** 构建与 deploy 均为绿色
- [ ] GitHub Variables 已配置：`STAGING_IMAGE_PLAYGROUND_URL`（`https://image.easyapi.work`）、`STAGING_PUBLIC_NEWAPI_BASE_URL`
- [ ] 服务器 `portal-test.environment` 已注入：`IMAGE_PLAYGROUND_ALLOWED_ORIGIN`、`IMAGE_PLAYGROUND_URL`（均为 `https://image.easyapi.work`）
- [ ] `image.easyapi.work` openresty 已配置 `frame-ancestors` / `no-store` / `no-referrer`（见上文 **image.easyapi.work 反代与安全头**）
- [ ] 服务器 **仅** `portal-test` 已 recreate，镜像 tag 与分支一致（`dev-latest` / `test-latest`）
- [ ] `curl https://test.easyapi.work/api/health` → `ok: true`
- [ ] `pnpm seed:screenshot-user` 成功
- [ ] `https://test.easyapi.work/dashboard/playground?tab=image` 在配置 `STAGING_IMAGE_PLAYGROUND_URL` 时出现生图 iframe，iframe URL 不含 `sk-*` 或 `portal-token-<id>`
- [ ] `/v1/images/generations` CORS preflight 对 `STAGING_IMAGE_PLAYGROUND_URL` 的 origin 返回 `access-control-allow-origin`
- [ ] `pnpm screenshots:e2e` 生成 9 张截图

### Portal static assets (public/)

Duck/brand images (e.g. `duck.webp`, `duck-icon.png`) live under `newapi-portal/public/`. The repo root `.gitignore` ignores `*.png` / `*.webp` globally; keep the exceptions `!newapi-portal/public/` and `!newapi-portal/public/**` so these files are committed. The `newapi-portal/Dockerfile` runner stage must `COPY --from=builder /app/public ./public` or the container will not serve them (broken `next/image` icons on staging).

Verify after deploy:

```bash
curl -I https://test.easyapi.work/duck.webp
```

Expect `HTTP/2 200` and `content-type: image/webp`.
