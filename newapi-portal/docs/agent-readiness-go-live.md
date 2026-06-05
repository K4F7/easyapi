# Agent Readiness 正式上线待办事项

本文档记录 agent readiness / discovery metadata 正式上线前必须完成的配置、DNS 发布要求和上线后验证清单。以下示例中的域名均需替换为最终生产公网 HTTPS 域名。

## 生产域名与 APP_URL

- 生产环境必须将 `APP_URL` 配置为最终公网 `https://` 域名，例如 `https://example.com`。
- 不要使用本地地址、临时预览域名、内网域名或非 HTTPS 地址作为正式生产 `APP_URL`。
- `APP_URL` 会影响 sitemap、robots、首页 discovery `Link`、OAuth/OIDC metadata、MCP server card、agent skills index、`auth.md` 等公开 metadata 中出现的绝对 URL。上线前需要确认所有生成链接均指向最终生产域名。

## DNS-AID 发布要求

当前应用只提供 DNS-AID / agent discovery 的说明和 HTTP metadata 端点，不能代替 DNS provider 完成 DNS 发布。正式上线时，必须在实际托管该域名的 DNS provider 中配置对应记录。

建议 DNS-AID 记录模板如下，`<domain>` 必须替换为正式生产域名：

- `_index._agents.<domain>`：建议使用 SVCB/HTTPS ServiceMode 记录，指向 agent skills index 或 agent discovery index 对应的 HTTPS 服务。
- `_a2a._agents.<domain>`：建议使用 SVCB/HTTPS ServiceMode 记录，指向 A2A / agent-to-agent discovery 对应的 HTTPS 服务。

根据当前 `auth.md` 暴露的说明，正式上线时还应按需配置 TXT 辅助记录。以下记录名同样必须替换为正式生产域名：

- `_agent.<domain>`：用于声明该域名的 agent discovery / auth 文档入口或相关提示。
- `_mcp.<domain>`：用于声明该域名的 MCP server card 或 MCP discovery 入口。

上线前需要由 DNS 管理员确认：

- 记录名、记录类型、记录值和 TTL 符合 DNS provider 的实际格式要求。
- SVCB/HTTPS ServiceMode 记录在目标 DNS provider、递归解析链路和目标客户端中可正常查询。
- TXT 辅助记录不会与既有安全、验证或产品记录冲突。
- 所有记录均指向最终生产 HTTPS 域名，不指向预览环境。

## DNSSEC 要求

- 正式上线域名应启用 DNSSEC。
- DNSSEC DS 记录必须在注册商侧正确发布。
- DNS provider 侧的 zone signing 状态必须正常，不能存在过期签名、错误的 key rollover 或断链。
- 上线前需要使用支持 DNSSEC 验证的工具检查关键 DNS-AID 记录和 TXT 辅助记录的 AD / validated 状态。
- 如果生产域名暂时无法启用 DNSSEC，需要在上线风险记录中明确说明原因、影响范围、补救计划和预计完成时间。

## OAuth/OIDC 状态说明

当前 OAuth/OIDC 暴露为 metadata-only readiness 能力，不代表已经提供可用于生产授权流程的真实 OAuth 授权服务。

正式启用 OAuth 前必须完成：

- 将 authorization、token、revocation、JWKS、issuer 等 metadata 中的 placeholder endpoints 替换为真实生产 OAuth/OIDC 服务端点。
- 确认 issuer 与最终生产 HTTPS 域名、证书、反向代理配置一致。
- 完成 client registration、scope、audience、token lifetime、refresh / revoke 策略和 JWKS key rotation 策略。
- 对授权码流程、token 颁发、token introspection 或验证、撤销、错误响应、安全 header 和审计日志进行生产级验证。

在 OAuth 正式服务未启用前，对外沟通时应明确：这些端点用于 discovery/readiness metadata，不应被第三方视为可完成真实授权的生产 OAuth 服务。

## 上线后 curl 验证清单

以下命令中的 `https://example.com` 必须替换为最终生产公网 HTTPS 域名。建议上线后在外部网络环境执行，并保存 HTTP 状态码、关键响应头和响应体摘要。

```bash
export APP_URL="https://example.com"
```

### sitemap

```bash
curl -i "$APP_URL/sitemap.xml"
```

检查项：

- HTTP 状态码为 `200`。
- `Content-Type` 与 XML sitemap 匹配。
- URL 均为最终生产 HTTPS 域名。

### robots

```bash
curl -i "$APP_URL/robots.txt"
```

检查项：

- HTTP 状态码为 `200`。
- `Sitemap` 指向最终生产 `https://` sitemap。
- 不包含误封生产站点关键路径的规则。

### 首页 Link discovery

```bash
curl -I "$APP_URL/"
```

检查项：

- HTTP 状态码为 `200` 或符合生产首页预期。
- `Link` 响应头包含 agent readiness / discovery 相关 metadata 入口。
- `Link` 响应头中的 URL 均指向最终生产 HTTPS 域名。

### 首页 Accept text/markdown

```bash
curl -i -H "Accept: text/markdown" "$APP_URL/"
```

检查项：

- 响应符合首页 markdown discovery 的预期。
- 返回内容中的绝对 URL 均为最终生产 HTTPS 域名。
- 不泄露预览域名、本地地址或内部服务地址。

### api-catalog

```bash
curl -i "$APP_URL/.well-known/api-catalog"
```

检查项：

- HTTP 状态码为 `200`。
- `Content-Type` 符合 JSON metadata 预期。
- API catalog 中的 endpoint、documentation、auth 相关 URL 均为最终生产 HTTPS 域名。

### OAuth authorization server metadata

```bash
curl -i "$APP_URL/.well-known/oauth-authorization-server"
curl -i "$APP_URL/.well-known/openid-configuration"
```

检查项：

- HTTP 状态码为 `200`。
- issuer 和所有 endpoint URL 均为最终生产 HTTPS 域名。
- 如果仍为 metadata-only，占位端点必须在上线说明和风险记录中明确标注，不能当作真实 OAuth 授权服务交付。

### OAuth protected resource metadata

```bash
curl -i "$APP_URL/.well-known/oauth-protected-resource"
```

检查项：

- HTTP 状态码为 `200`。
- resource、authorization server、scope 等字段符合生产环境预期。
- 不包含本地、预览或 placeholder 域名。

### auth.md

```bash
curl -i "$APP_URL/auth.md"
```

检查项：

- HTTP 状态码为 `200`。
- `Content-Type` 符合 markdown 文档预期。
- DNS-AID、TXT 辅助记录和 OAuth/OIDC 状态说明均使用最终生产域名。

### MCP server card

```bash
curl -i "$APP_URL/.well-known/mcp/server-card.json"
```

检查项：

- HTTP 状态码为 `200`。
- `Content-Type` 符合 JSON metadata 预期。
- server card 中的 base URL、auth URL、文档 URL 均为最终生产 HTTPS 域名。

### agent skills index

```bash
curl -i "$APP_URL/.well-known/agent-skills/index.json"
```

检查项：

- HTTP 状态码为 `200`。
- skills index 中每个 skill 的 URL 均可访问。
- 所有 URL 均为最终生产 HTTPS 域名。

如存在单个 skill 的 `SKILL.md` 端点，还应逐项验证：

```bash
curl -i "$APP_URL/.well-known/agent-skills/<skill>/SKILL.md"
```

## 上线阻断项

以下任一问题未解决时，不应宣称 agent readiness 已完成正式生产上线：

- `APP_URL` 不是最终公网 HTTPS 域名。
- DNS provider 尚未发布 DNS-AID 记录或 TXT 辅助记录。
- DNSSEC 未启用且没有正式风险接受记录。
- OAuth/OIDC placeholder endpoints 被对外描述为真实生产授权服务。
- curl 验证清单中任一核心 metadata 端点返回错误、预览域名、本地地址或内部服务地址。
