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
| 镜像 | `ghcr.io/k4f7/easyapi/newapi-portal:test-latest` |
| GHA 工作流 | [`.github/workflows/newapi-portal-image.yml`](../.github/workflows/newapi-portal-image.yml) |

**标准流程顺序（必须遵守）：**

```
推送 main → GHA 构建镜像 → 服务器拉取并部署 portal-test → health check → seed 测试用户 → Playwright 截图
```

Playwright 在**本地**运行，通过公网访问 `test.easyapi.work`；seed 脚本通过 HTTPS 调用 Portal API，无需 SSH 进容器写库。

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

### 步骤 1：推送代码，等待 GHA 构建

```bash
git push origin main
```

GitHub Actions 工作流 **Build newapi-portal image** 会在 push 到 `main` 时触发，构建并推送：

```
ghcr.io/k4f7/easyapi/newapi-portal:test-latest
```

查看构建状态：

```bash
gh run list --repo K4F7/easyapi --workflow "Build newapi-portal image" --limit 3
gh run watch <run-id> --repo K4F7/easyapi --exit-status
```

**必须等 GHA 成功后再部署**；否则服务器上的仍是旧镜像。

### 步骤 2：SSH 到服务器，仅更新 portal-test

```bash
ssh root@45.142.115.128
cd /opt/easyapi-portal-test

docker pull ghcr.io/k4f7/easyapi/newapi-portal:test-latest

PORTAL_IMAGE=ghcr.io/k4f7/easyapi/newapi-portal:test-latest \
  docker compose -p easyapi-portal \
  -f docker-compose.easyapi-portal-test.yml \
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

### 步骤 4：Seed 截图测试用户

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

输出目录：`newapi-portal/screenshots/<YYYY-MM-DD>/`（9 张 PNG：首页、登录、注册 + 6 个 dashboard 页）。

---

## 5. npm 脚本参考

均在 **`newapi-portal`** 目录下执行（`pnpm <script>`）：

| 脚本 | 作用 |
|------|------|
| `seed:screenshot-user` | 对 `SEED_BASE_URL`（默认 staging）注册/验证 `scr@easyapi.work` |
| `prepare:test-db` | SSH 远程重建 easyapi-portal 测试库、seed、导出 `test-data/*.sql.gz` |
| `screenshots:e2e` | 仅运行 Playwright 截图 spec（需已部署新镜像 + 测试用户可登录） |
| `screenshots:all` | `seed:screenshot-user` 然后 `screenshots:e2e`（一条龙；仍须先完成 GHA + 服务器部署） |

相关文件：

- Seed：[`newapi-portal/scripts/seed-screenshot-user.mjs`](../newapi-portal/scripts/seed-screenshot-user.mjs)
- 截图 spec：[`newapi-portal/tests/e2e/screenshots.spec.ts`](../newapi-portal/tests/e2e/screenshots.spec.ts)
- Playwright 配置：[`newapi-portal/playwright.config.ts`](../newapi-portal/playwright.config.ts)

---

## 6. 故障排查

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

- [ ] `main` 已 push，GHA **Build newapi-portal image** 为绿色
- [ ] 服务器已 `docker pull` 且 **仅** `portal-test` 已 recreate
- [ ] `curl https://test.easyapi.work/api/health` → `ok: true`
- [ ] `pnpm seed:screenshot-user` 成功
- [ ] `pnpm screenshots:e2e` 生成 9 张截图

### Portal static assets (public/)

Duck/brand images (e.g. `duck.webp`, `duck-icon.png`) live under `newapi-portal/public/`. The repo root `.gitignore` ignores `*.png` / `*.webp` globally; keep the exceptions `!newapi-portal/public/` and `!newapi-portal/public/**` so these files are committed. The `newapi-portal/Dockerfile` runner stage must `COPY --from=builder /app/public ./public` or the container will not serve them (broken `next/image` icons on staging).

Verify after deploy:

`ash
curl -I https://test.easyapi.work/duck.webp
`

Expect `HTTP/2 200` and `content-type: image/webp`.
