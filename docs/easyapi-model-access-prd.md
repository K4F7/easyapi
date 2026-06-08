# Product Requirements Document: EasyAPI 模型便捷接入与渠道体系

**Version**: 1.6
**Date**: 2026-06-09
**Author**: Sarah (Product Owner)
**Quality Score**: 95/100

---

## Executive Summary

EasyAPI Portal 的核心目标是让开发者**便捷接入并调用 AI 模型**：注册后即可获取 API Key、按渠道档位选择服务质量，并在 Playground 中体验 Chat 与生图。运营通过官方 NewAPI（latest 镜像）在后台管理 Key、渠道与倍率；门户专注用户侧体验，**不暴露** NewAPI 管理功能。

本 PRD 汇总 MVP 范围：核心流程稳定运行、三档渠道体系、前端→BFF→NewAPI 通信保障、Chat 体验打磨、生图 iframe 默认浅色（**不改生图镜像**）、首次访问引导、Fastboot 模型别名化。接入文档页列为 Phase 2。

网站**尚未适配深色模式**；门户与生图嵌入区均应以**浅色为默认**，避免与未完成的深色适配产生割裂。

---

## Problem Statement

**Current Situation**

- 门户已有注册/登录、Dashboard、Token、计费、Playground 等能力，但需保证**各部分按预期稳定运行**。
- Token 创建未暴露渠道档位（`group`）；列表页无法便捷调整已有 Key 的渠道；BFF 缺少 Token 更新路由（`lib/newapi` 有 `updateToken`，`/api/tokens/[id]` 仅 DELETE）。
- Playground Chat 体验需打磨；新用户缺少引导；Fastboot 脚本写死模型版本，上游变更后易失效。
- 生图 Tab 通过 iframe 嵌入 `gpt_image_playground`（同源 `/playground/embed/`）。上游使用 `darkMode: 'media'`，深色系统下 iframe 会变黑，与 Portal 亮色界面不一致。有人见过浅色界面，实为**系统浅色模式**下上游自动呈现，并非独立主题 API。
- 门户整体**未做深色模式适配**，不应随系统进入深色表现。

**Proposed Solution**

1. NewAPI 后台配置三档渠道；门户固定标签展示，Token 创建/编辑时选择档位。
2. Playground 自动使用「一般渠道」+ `cross_group_retry`；故障转移遵循 NewAPI 官方逻辑，门户不硬编码跳组顺序。
3. 严格 **前端 → BFF → NewAPI**；补齐 BFF 路由与契约同步。
4. Chat 布局与模型选择器打磨；首次登录可跳过引导。
5. Fastboot 默认 `gpt-latest` / `claude-latest` 等别名。
6. 生图 iframe **默认浅色**：仅通过 Portal 同源代理层处理（HTML/CSS 改写），**不修改、不 fork `gpt_image_playground` Docker 镜像**。
7. 门户全局默认浅色（待深色适配完成前不启用系统深色）。

**Business Impact**

- 降低接入摩擦与脚本失效风险；差异化渠道定价；稳定性优先（核心流程零阻断）。

---

## Success Metrics

**Primary KPIs（MVP）**

- **核心流程可用性**：注册 → 充值/额度 → 创建 Token → 复制接入信息 → Playground 对话/生图，测试环境 E2E 可重复通过。
- **BFF 通信健康**：写操作均经 `/api/*`；结构化错误码 + 中文文案；无前端直连 NewAPI。
- **渠道 SLA（运营目标）**：低价 ~50% 在线、一般 ~80%、高价 ~99.9%（门户标注为预期，非合约承诺）。
- **浅色一致性**：深色 OS 下 Portal 与生图 iframe 仍为浅色视觉（验收含 Playwright `colorScheme: 'dark'` 场景）。

**Validation**：`https://test.easyapi.work` 部署后跑通 E2E（见下文「E2E 测试计划」）+ 人工抽检三档 Token 路由。

---

## MVP Status Update (2026-06-09)

| Area | Current status | Evidence / blocker |
|------|----------------|--------------------|
| Portal MVP PR | Merged | easyapi PR #23, merge commit `5b7c82f7` |
| Staging CD / E2E | Passed | Run `27156406233`: `39 passed, 25 skipped`; test site `https://test.easyapi.work` |
| Token tier UI / BFF E2E | Passed for UI/BFF contract | Real three-tier routing remains blocked pending NewAPI group routing validation |
| Chat / onboarding / theme | Passed | Chat, onboarding, image playground light, and portal/theme light coverage passed |
| Image playground internal URL | Available | `IMAGE_PLAYGROUND_INTERNAL_URL=https://image.easyapi.work/` |
| Fastboot aliases | Merged and published | fastboot PR #1, merge commit `f6c49efa`; `https://easyapi.work/sh/claudecode.sh` and `https://easyapi.work/sh/opencode-ui.sh` return HTTP 200 |
| `gpt-latest` alias | Verified | NewAPI returned model `gpt-5.5` |
| `claude-latest` alias | Blocked | `/v1/models` does not expose `claude-latest`, so alias visibility cannot be verified from the public model list |
| Check-in diagnostics | Blocked | easyapi PR #26/#27/#28 merged; run `27156420986` injects `NEWAPI_BASE_URL=https://api.easyapi.work` and no longer fails base URL validation, but `https://api.easyapi.work` HTTPS/SNI login preflight fails and `STAGING_NEWAPI_ADMIN_TOKEN` is missing, so the run has not reached `/api/checkin` quota apply |

---

## User Personas

### Primary: 独立开发者 / 小团队工程师

- **Goals**: 快速拿 Key、选渠道档位、Playground 试模型、复制接入信息
- **Pain Points**: 不知选哪个渠道、iframe 发黑、脚本模型名过期
- **Technical Level**: 中级

### Secondary: EasyAPI 运营管理员

- **Goals**: 在 NewAPI 后台管理渠道/分组/别名；门户不暴露管理面
- **Technical Level**: 高级

---

## Architecture: 前端 → BFF → NewAPI

```
前端 (apiFetch)  →  BFF (/api/*)  →  NewAPI (newApiRequest)
                       ↓
                 Prisma 门户会话
```

| 层级 | 职责 |
|------|------|
| 前端 | 仅调 `/api/*`；消费 `{ ok, data \| error }` |
| BFF | 会话→NewAPI 凭据、`Authorization` + `New-Api-User`、Zod 校验、mask、错误归一 |
| NewAPI | Token/渠道/计费真相源；契约见 `docs/newapi-contract.md` |

**BFF 缺口（MVP 补齐）**

| 能力 | BFF 路由 | 状态 |
|------|----------|------|
| Token 更新渠道 | `PUT /api/tokens/:id` | 已合并；UI/BFF E2E 通过，真实三档路由待 NewAPI 分组验证 |
| 渠道档位元数据 | `GET /api/channels/tiers` | 已合并；UI/BFF E2E 通过，真实三档路由待 NewAPI 分组验证 |
| 生图 embed 配置 | `GET /api/playground/images/embed-config` | 已扩展 `theme`；浅色 E2E 通过，内部 URL `https://image.easyapi.work/` 可用 |

---

## User Stories & Acceptance Criteria

### Story 1: 创建 Token 时选择渠道档位

**As a** 开发者 **I want to** 创建 Key 时选低价/一般/高价 **So that** 按成本与稳定性调用模型

- [ ] 三档固定标签 + 稳定性说明；默认「一般渠道」
- [ ] 提交写入 NewAPI `group`；完整 Key 仍只显示一次

### Story 2: Token 列表便捷调整渠道

**As a** 开发者 **I want to** 在令牌页修改渠道 **So that** 无需删重建

- [ ] 列表展示档位标签；行内/快捷修改 `group`
- [ ] 操练场专用 Token 对用户隐藏或不可编辑

### Story 3: Playground 自动一般渠道 + 故障转移

**As a** 开发者 **I want to** 打开 Playground 即可用 **So that** 零配置体验

- [ ] Chat Token：`group`=一般、`cross_group_retry: true`
- [ ] 跳组顺序由 NewAPI `auto` 配置决定，门户不硬编码
- [ ] 运维文档记录推荐 `auto` 顺序

### Story 4: 首次访问引导

**As a** 新用户 **I want to** 首次登录分步引导（可跳过、可恢复） **So that** 知道如何接入

- [ ] 覆盖：接入信息 → 创建 Token（含渠道）→ Playground

### Story 5: Chat Playground 打磨

**As a** 开发者 **I want to** 更好的 Chat 布局与模型选择 **So that** 试模型体验达标

- [ ] 消息布局/移动端；模型选择器搜索/filter
- [ ] MVP 不含多会话历史、参数面板（Phase 2）

### Story 6: 生图 iframe 默认浅色（不改生图镜像）

**As a** 开发者 **I want to** 生图 Tab 始终浅色 **So that** 与未适配深色的 Portal 一致

**约束（产品明确要求）**

- **禁止**修改、fork 或重建 `gpt_image_playground` Docker 镜像
- **仅允许** Portal 侧方案：同源代理 `/playground/embed/` 对上游响应做改写

**上游现状（调研）**

- `tailwind.config.js`：`darkMode: 'media'`
- 无 URL `theme` 参数、无设置项主题开关
- 「见过浅色」= 用户系统为浅色模式时的正常现象

**推荐 Portal 实现（写入 PRD，待开发）**

1. 代理 HTML：注入 `color-scheme: light`、浅色 `theme-color`、基础浅色样式
2. 代理 CSS：剥离 `@media (prefers-color-scheme: dark) { ... }` 块
3. `ImagePanel` iframe URL 可带 `theme=light`（上游可忽略，供将来兼容）
4. `embed-config` 返回 `{ theme: "light" }`

**Acceptance Criteria**

- [ ] 不变更 `IMAGE_PLAYGROUND_INTERNAL_URL` 指向的镜像版本/构建方式
- [ ] 深色 OS 下生图 iframe 主背景仍为浅色（如 `#f9fafb` / `bg-gray-50` 效果）
- [ ] 安全模型不变：同源代理、URL 不含真实 API Key
- [ ] E2E 在 `colorScheme: 'dark'` 下断言 iframe 浅色

### Story 7: 门户全局默认浅色

**As a** 用户 **I want to** 全站保持浅色 **So that** 在未完成深色适配前体验一致

- [ ] `html` 固定浅色策略（`color-scheme: light`；不随系统切深色）
- [ ] Tailwind 保持 `darkMode: class`，**不**挂载 `.dark` 至根节点
- [ ] Toast 等组件使用 `light` 主题，非 `system`
- [ ] 深色模式全站适配列为 **Phase 2 / 未来**，本 MVP 不交付

### Story 8: BFF 与 NewAPI 可靠通信

- [ ] 前端仅 `/api/*`；新增 `PUT /api/tokens/:id`、`GET /api/channels/tiers`
- [ ] `newapi-contract.md` 与 BFF schema 同步；Dev Mock 覆盖 `group`
- [ ] Vitest + E2E 覆盖关键 BFF 路径

### Story 9: Fastboot 模型别名

- [ ] 默认 `gpt-latest` / `claude-latest`；NewAPI 配置别名映射；保留手动覆盖

### Story 10: 核心流程稳定运行（横切）

- [ ] 登录/计费/Token/Playground/签到等 E2E 通过；旧 Token 无 `group` 时向后兼容

---

## Functional Requirements

### 三档渠道（用户侧固定标签）

| 用户标签 | 预期稳定性 | 定位 |
|----------|------------|------|
| 低价渠道 | ~50% 在线 | 低成本 |
| 一般渠道 | ~80% 在线 | 默认推荐 |
| 高价渠道 | ~99.9% 在线 | 高稳定高价 |

### 生图 iframe 浅色（Portal-only）

- **User flow**: Playground 生图 Tab → iframe `src=/playground/embed/?...` → BFF 反代 → 改写 HTML/CSS → 用户见浅色 UI
- **Edge cases**: 代理未配置 → 现有 503/占位文案；改写失败 → 记日志，不阻断生图 API
- **Out of scope**: 修改 playground 镜像、上游 PR、独立主题设置页

### Out of Scope（MVP）

- 修改 `gpt_image_playground` 镜像
- 门户内嵌 NewAPI 管理界面
- 全站深色模式适配
- 接入文档站（Phase 2）
- Playground 多会话/参数面板/渠道健康仪表盘
- 注册法律条款门（需法务文案后）

---

## Technical Constraints

### 通信架构

- 严格前端 → BFF → NewAPI；Playground SSE 由 BFF 代理
- `NEWAPI_*` 不进 `NEXT_PUBLIC_*`（除展示用 API 地址）

### 生图嵌入

- `IMAGE_PLAYGROUND_INTERNAL_URL` 运行时配置；镜像保持官方/现网版本
- 浅色强制仅在 `image-playground-proxy` / `rewritePlaygroundEmbedHtml` / CSS 改写层实现
- 详见 `docs/image-playground-security.md`

### 性能与安全

- 代理 CSS 改写仅对 `text/css` 响应；不缓冲 SSE
- Key mask、embed `frame-ancestors`、无 URL 密钥不变

### Technology Stack

- Portal: Next.js 15, React 19, TypeScript, Prisma, NewAPI client
- 测试: Vitest, Playwright
- Fastboot: 独立仓库，直连用户 API 入口

---

## MVP Scope & Phasing

### Phase 1: MVP

1. 核心流程稳定 + BFF 补齐
2. 三档渠道 Token 创建/编辑
3. Playground 渠道策略（NewAPI `auto` + `cross_group_retry`）
4. Chat 打磨 + 首次引导
5. **生图 iframe 浅色（Portal 代理，不改镜像）**
6. **门户全局默认浅色**
7. Fastboot 模型别名

### Phase 2

- 接入文档页（静态站或门户 `/docs`）
- 全站深色模式适配
- Playground 增强（历史、参数、渠道状态）
- Dashboard 渠道健康只读展示

---

## E2E 测试计划

MVP 交付以 **Playwright E2E** 为端到端验收手段：既有用例须保持通过，新功能须补充对应用例并纳入 CI 或约定脚本。单元测试（Vitest）覆盖 BFF/代理逻辑，不替代 E2E。

### 测试基础设施

| 项 | 说明 |
|----|------|
| 框架 | Playwright（`newapi-portal/tests/e2e/`） |
| 默认目标 | `E2E_BASE_URL` → `https://test.easyapi.work` |
| 登录账号 | `E2E_PORTAL_IDENTIFIER`、`E2E_PORTAL_PASSWORD`（staging 种子用户，见 `docs/test-deploy-easyapi-portal.md`） |
| 生图环境 | `IMAGE_PLAYGROUND_INTERNAL_URL` / `STAGING_IMAGE_PLAYGROUND_INTERNAL_URL` 或 `EXPECT_IMAGE_PLAYGROUND=true` |
| 配置文件 | `newapi-portal/playwright.config.ts` |

**常用命令**（在 `newapi-portal/` 下）：

| 命令 | 范围 |
|------|------|
| `pnpm test:e2e:ci` | **GHA `verify_ui` 门禁**：smoke + playground + register-billing |
| `pnpm test:e2e:playground` | 仅操练场 |
| `pnpm test:e2e:register-billing` | 仅注册页 |
| `pnpm test:e2e:checkin` | 签到诊断（独立 workflow） |
| `pnpm test:e2e` | 全部 spec（含 screenshots，本地用） |
| `pnpm test` | Vitest 单元测试（CI `portal-ci`） |

**CI 分工**

- **PR / push**（`portal-ci.yml`）：lint、Vitest 单元测试、build
- **部署后**（`portal-cd.yml` → `verify_ui`）：`test:e2e:ci` 对 staging
- **签到诊断**（`checkin-diagnostics.yml`）：`test:e2e:checkin`（按需/定时）

---

### 基线 E2E（已有，MVP 须保持通过）

#### A. 门户冒烟 — `portal-smoke.spec.ts` → Story 8 / 10

| 用例 | 断言要点 |
|------|----------|
| `health endpoint reports the portal service as OK` | `GET /api/health` → `{ ok: true, service: "newapi-portal" }` |
| `login page exposes password login and no OAuth entry points` | 邮箱/密码表单；无 GitHub/OAuth 入口 |
| `register page exposes the NewAPI native registration form` | 注册字段完整；无条款勾选；验证码 mock；`POST /api/auth/register` body 正确 |
| `anonymous dashboard access redirects to login` | 未登录访问 `/dashboard` → `/login` |
| `configured upstream account can log in and use protected portal pages` | 真实登录；`/api/auth/me` binding ready；`summary`/`tokens`/`usage`/`logs` API &lt; 500；遍历 `AUTH_ROUTES` 无页面级错误文案；无客户端 4xx/5xx 噪声 |

#### B. 注册页 — `register-billing.spec.ts` → Story 10 / 合规约束

| 用例 | 断言要点 |
|------|----------|
| `shows email, passwords, verification code, and invite code fields` | 表单字段可见；无服务条款/隐私勾选 |
| `validates password length, confirmation, and verification code` | 前端校验文案 |
| `register body omits acceptedTerms; inviteCode from URL is submitted` | body 含 `inviteCode`；无 `acceptedTerms` |
| `legacy aff query is not used for invite link format` | `?aff=` 不写入 body |
| `register page does not link to terms or privacy flows` | 无 `/terms`、`/privacy` 链接 |

#### C. 操练场 — `playground.spec.ts` → Story 3 / 5 / 6（部分）

| 用例 | 断言要点 |
|------|----------|
| `sidebar shows 操练场 between 用量 and 个人` | 侧栏顺序 |
| `defaults to chat tab; tab switches update URL without full reload` | 默认对话 Tab；`?tab=image`/`chat`；切换不整页 reload |
| `image tab passes only token identifiers to the iframe` | iframe 同源 `/playground/embed/`；含 `tokenId`/`imageApiUrl`；**无** `sk-*`、无 session token 在 URL |
| `playground token provisioning failure shows error` | `/api/playground/token` 500 → 「操练场初始化失败」 |
| `chat: suggestions, pills, multiline input, stream and usage` | 建议语、模式 pill、多行增高、SSE 流式、「≈ N tokens」 |
| `chat: stop keeps partial content; clear needs confirmation` | 停止生成；清空需确认 |
| `chat: upstream errors are sanitized` | 502 用户文案；页面不泄漏 `sk-live` |
| `navigation between dashboard pages has no client errors` | 概览↔用量↔操练场导航无客户端错误 |

#### D. 签到诊断 — `checkin-diagnostics.spec.ts` → Story 10（扩展能力）

| 用例 | 断言要点 |
|------|----------|
| `applies check-in quota and prints correlated diagnostics` | `POST /api/checkin` 前后 `dashboard/summary` 额度变化；输出关联诊断 JSON |

#### E. 截图（非 CI 门禁）— `screenshots.spec.ts`

| 用例 | 断言要点 |
|------|----------|
| 各公开页 + Dashboard 页截图 | 页面可渲染；产出 `screenshots/<date>/*.png`；用于运营/视觉回归，**不**纳入 `test:e2e:ci` |

---

### MVP 新增 E2E（待实现，按功能归类）

以下用例在对应 Story 开发完成后**必须**补充，并纳入 `test:e2e:ci` 或专用 npm script。

#### Story 1 & 2：三档渠道 Token

**建议文件**：`tests/e2e/tokens-channel.spec.ts`（或扩展现有 smoke）

| ID | 用例名 | 步骤与断言 |
|----|--------|------------|
| E2E-T01 | 创建 Token 默认一般渠道 | 打开创建对话框 → 默认选中「一般渠道」→ 提交 → `POST /api/tokens` body 含预期 `group` |
| E2E-T02 | 创建 Token 选择高价渠道 | 选「高价渠道」→ 创建成功 → 列表展示「高价渠道」标签 |
| E2E-T03 | 列表修改渠道档位 | 行内/快捷操作改为「低价渠道」→ `PUT /api/tokens/:id` 成功 → 列表标签更新 |
| E2E-T04 | 渠道元数据 BFF | `GET /api/channels/tiers` 返回三档固定文案 + `group` 映射 |
| E2E-T05 | 操练场 Token 不可编辑渠道 | 操练场专用 Token（若可见）无渠道编辑入口 |

#### Story 3：Playground 渠道策略

**建议文件**：扩 `playground.spec.ts` 或 `tests/e2e/playground-channel.spec.ts`

| ID | 用例名 | 步骤与断言 |
|----|--------|------------|
| E2E-P01 | Chat 自动 provision token | 进入操练场 → `GET /api/playground/token` 被调用 → 对话可用（已有，保持） |
| E2E-P02 | 操练场 Token 参数（集成/运维） | 可选：staging 上查验自动创建的 Chat Token 为一般渠道 + `cross_group_retry`（API 或 NewAPI 后台抽检；自动化可 mock BFF 响应校验 create 入参） |

#### Story 4：首次访问引导

**建议文件**：`tests/e2e/onboarding.spec.ts`

| ID | 用例名 | 步骤与断言 |
|----|--------|------------|
| E2E-O01 | 首次登录展示引导 | 新用户或清除引导标记 → Dashboard 出现分步遮罩 |
| E2E-O02 | 可跳过引导 | 点击跳过 → 不再自动弹出 |
| E2E-O03 | 可恢复引导 | 「继续引导」入口可再次打开 |
| E2E-O04 | 引导步骤覆盖核心路径 | 高亮接入信息、创建 Token、操练场入口 |

#### Story 5：Chat 打磨

**建议文件**：扩 `playground.spec.ts`

| ID | 用例名 | 步骤与断言 |
|----|--------|------------|
| E2E-C01 | 模型选择器搜索 | 模型列表 &gt; N 时，搜索框过滤模型名 |
| E2E-C02 | 移动端消息可读 | `viewport` 375px 下消息区不溢出、可滚动（可选 project） |

#### Story 6：生图 iframe 浅色（不改镜像）

**建议文件**：扩 `playground.spec.ts`

| ID | 用例名 | 步骤与断言 |
|----|--------|------------|
| E2E-I01 | 深色系统下 iframe 浅色 | Playwright project `colorScheme: 'dark'` → 生图 Tab → iframe 内 `body` 背景为浅色（如 `rgb(249, 250, 251)`） |
| E2E-I02 | embed-config 返回 theme | `GET /api/playground/images/embed-config` → `{ theme: "light" }` |
| E2E-I03 | iframe URL 含 theme 参数 | `src` 含 `theme=light`（上游可忽略） |
| E2E-I04 | 代理 HTML 含浅色注入 | `GET /playground/embed/` 响应 HTML 含 `color-scheme: light` 或 `ezapi-embed-light-theme` |

#### Story 7：门户全局浅色

**建议文件**：`tests/e2e/theme-light.spec.ts`

| ID | 用例名 | 步骤与断言 |
|----|--------|------------|
| E2E-L01 | 深色系统下 Portal 仍浅色 | `colorScheme: 'dark'` → Dashboard/Token 页主背景非深灰黑；`html` 无 `.dark` class |
| E2E-L02 | Toast 浅色主题 | 触发 toast 后容器为浅色样式 |

#### Story 8：BFF 通信

**建议文件**：扩 `portal-smoke.spec.ts` 或 `tests/e2e/bff-contract.spec.ts`

| ID | 用例名 | 步骤与断言 |
|----|--------|------------|
| E2E-B01 | Token 更新路由 | 登录态 `PUT /api/tokens/:id` 更新 `group` → 200 + 列表一致 |
| E2E-B02 | 错误信封结构 | 故意无效 `group` → `{ ok: false, error: { code, message } }` 中文 message |
| E2E-B03 | 无前端直连 NewAPI | 页面网络请求 host 均为 Portal 域（抽样 `tokens`/`playground` 页） |

#### Story 9：Fastboot 模型别名

**范围**：非 Portal E2E；在 `fastboot` 仓库用脚本测试 + 文档验收清单：

- [ ] `curl -fsSL https://easyapi.work/sh/claudecode.sh | bash -s -- --help` 成功
- [ ] 安装后环境变量含 `gpt-latest` / `claude-latest` 别名
- [ ] `/v1/models` 校验通过

#### Story 10：核心流程回归（横切）

| 要求 | 说明 |
|------|------|
| CI 全绿 | 每次 MVP 合并前 `portal-ci` + 部署后 `test:e2e:ci` 通过 |
| 路由覆盖 | `AUTH_ROUTES`（`tests/e2e/routes.ts`）全部可访问且无 `errorTexts` |
| 向后兼容 | 无 `group` 的旧 Token 列表/调用仍正常（E2E-T06：列表存在旧 Token 时不报错） |

---

### E2E 与 User Story 追溯矩阵

| Story | 基线 spec | MVP 新增 ID |
|-------|-----------|-------------|
| 1 创建 Token 选渠道 | smoke（tokens API） | E2E-T01, T02 |
| 2 编辑渠道 | smoke（tokens API） | E2E-T03, T05 |
| 3 Playground 渠道 | playground | E2E-P01, P02 |
| 4 首次引导 | — | E2E-O01–O04 |
| 5 Chat 打磨 | playground（chat 系列） | E2E-C01, C02 |
| 6 生图浅色 | playground（image 部分） | E2E-I01–I04 |
| 7 门户浅色 | — | E2E-L01, L02 |
| 8 BFF | smoke（API） | E2E-B01–B03, T04 |
| 9 Fastboot | — | 脚本清单（非 Playwright） |
| 10 稳定运行 | smoke + register + playground + checkin | E2E-T06 + CI 门禁 |

### MVP 完成后 CI 建议调整

将新增 spec 纳入门禁：

```json
"test:e2e:ci": "playwright test tests/e2e/portal-smoke.spec.ts tests/e2e/playground.spec.ts tests/e2e/register-billing.spec.ts tests/e2e/tokens-channel.spec.ts tests/e2e/onboarding.spec.ts tests/e2e/theme-light.spec.ts"
```

当前验收状态：staging CD/E2E run `27156406233` 已通过，结果为 `39 passed, 25 skipped`，测试站点为 `https://test.easyapi.work`。该结果覆盖 Token tier UI/BFF E2E、Chat、onboarding、image playground light、portal/theme light 等 MVP 验收项。

`checkin-diagnostics` 与 `screenshots` 保持独立，不阻塞常规发布。check-in diagnostics run `27156420986` 已确认 `NEWAPI_BASE_URL=https://api.easyapi.work` 注入且不再出现 base URL 校验错误，但仍因 `https://api.easyapi.work` HTTPS/SNI 登录 preflight 失败及缺少 `STAGING_NEWAPI_ADMIN_TOKEN` 被阻塞，尚未进入 `/api/checkin` quota apply。

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| CSS 改写遗漏部分 dark 规则 | Med | Med | E2E 深色系统验收；增量补充剥离规则 |
| 上游 CSS 打包格式变化 | Low | Med | 单元测试覆盖 `stripPrefersColorSchemeDarkQueries` |
| NewAPI 分组名与门户映射不一致 | Med | High | 环境变量集中配置 + 部署检查 |
| BFF 契约漂移 | Med | High | `newapi-contract.md` + 集成测试 |
| 用户期望「主题开关」 | Low | Low | PRD 明确：默认浅色，非用户可切换主题 |

---

## Dependencies & Blockers

**Dependencies**

- NewAPI 运营：三档分组、`auto` 顺序、模型别名 — 运维
- Portal 全栈：BFF、UI、代理浅色 — 开发
- Fastboot 脚本更新 — 开发者体验
- 测试环境分组/别名与生产策略一致 — DevOps

**Known Blockers**

- 三档 Token 真实路由 blocked：Token tier UI/BFF E2E 已通过，但仍需 NewAPI 分组/路由在真实环境完成验证。
- `claude-latest` NewAPI 可见性 blocked：`/v1/models` 不暴露该别名，无法通过公开模型列表验收。
- check-in diagnostics blocked：`https://api.easyapi.work` HTTPS/SNI 登录 preflight 失败，且缺少 `STAGING_NEWAPI_ADMIN_TOKEN`，未进入 `/api/checkin` quota apply。

---

## Appendix

### Glossary

- **BFF**: `src/app/api/**` Route Handlers，代理 NewAPI
- **cross_group_retry**: Token 级；`auto` 模式下跨组重试（NewAPI 官方）
- **gpt_image_playground**: 生图 SPA；Portal 仅反代，**MVP 不修改其镜像**

### NewAPI 故障转移参考

- [PR #2426](https://github.com/QuantumNous/new-api/pull/2426)、[PR #4226](https://github.com/QuantumNous/new-api/pull/4226)
- 契约：`docs/newapi-contract.md`

### References

- [README](../README.md)
- [NewAPI Contract](./newapi-contract.md)
- [Image Playground Security](./image-playground-security.md)
- [Test Deploy Guide](./test-deploy-easyapi-portal.md)
- [Fastboot](../../fastboot/README.md)
- easyapi PR #23: merged commit `5b7c82f7`
- easyapi PR #26/#27/#28: check-in diagnostics fixes; run `27156420986`
- Staging CD/E2E run `27156406233`: `39 passed, 25 skipped`
- Test site: `https://test.easyapi.work`
- Image playground internal URL: `https://image.easyapi.work/`
- Fastboot PR #1: merged commit `f6c49efa`
- Published fastboot scripts: `https://easyapi.work/sh/claudecode.sh`, `https://easyapi.work/sh/opencode-ui.sh`
- E2E 目录：`newapi-portal/tests/e2e/`
- 路由清单：`newapi-portal/tests/e2e/routes.ts`
- 生图嵌入：`newapi-portal/src/components/playground/image-panel.tsx`
- 代理实现：`newapi-portal/src/lib/playground/image-playground-proxy.ts`

---

*本 PRD 通过交互式需求收集生成。v1.6：记录已合并 PR、staging E2E 验收状态与当前阻塞项。v1.5：补充 E2E 测试计划（基线 + MVP 待增 + Story 追溯矩阵）。v1.4：生图浅色 Portal-only、禁止改镜像。*
