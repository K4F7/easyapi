# NewAPI integration contract

This document tracks the NewAPI surface that `newapi-portal` currently depends on. It is intended as the migration checklist for moving the portal to an official upstream deployment of `QuantumNous/new-api`.

## Base configuration

- `NEWAPI_BASE_URL` must point at the deployed NewAPI HTTP endpoint. It should not assume the bundled `xbh-new-api` directory or service name.
- Authenticated NewAPI calls use both headers:
  - `Authorization: Bearer <access token>`
  - `New-Api-User: <user id>`
- Admin operations use `NEWAPI_ADMIN_TOKEN` and `NEWAPI_ADMIN_USER_ID` through the same two headers.
- The portal expects JSON responses and accepts either plain payloads or envelopes with `success`, `message`, `data`, `code`, or `error`.

## User auth and profile

### Register

- Endpoint: `POST /api/user/register`
- Request body:
  - `username`: email address used by the portal.
  - `email`: same email address.
  - `password`.
  - `verification_code`: optional.
  - `aff_code`: optional invite or affiliate code.
- Optional query:
  - `turnstile`: optional captcha token.
- Expected behavior:
  - A non-2xx response or `{ "success": false }` is treated as registration failure.
  - Error text is inspected to distinguish verification-required and registration-disabled cases.

### Login

- Endpoint: `POST /api/user/login`
- Request body:
  - `username`.
  - `password`.
- Expected response:
  - User id in `id`, `user_id`, or `userId`, either at top level, under `data`, or under `user`.
  - Username in `username`.
  - Display name in `display_name` or `displayName` when present.
  - Optional access token in `access_token`, `accessToken`, or `token`.
  - Optional `require_2fa` or `require2fa`; if true, the portal rejects the login.
  - If no access token is returned, the portal expects a session cookie from login and then calls `/api/user/token`.

### Access token

- Endpoint: `GET /api/user/token`
- Request headers:
  - `Cookie`: session cookie returned by `/api/user/login`.
  - `New-Api-User`: NewAPI user id.
- Expected response:
  - Access token as a string, `data`, `access_token`, `accessToken`, or `token`.

### Self

- Endpoint: `GET /api/user/self`
- Request headers:
  - `Authorization`.
  - `New-Api-User`.
- Expected fields used by the portal include:
  - `id`, `username`, `display_name`, `role`, `status`, `email`, `group`.
  - `quota`, `used_quota`, `request_count`.

## Admin user and quota

### Create user

- Endpoint: `POST /api/user/`
- Request headers:
  - Admin `Authorization`.
  - Admin `New-Api-User`.
- Request body:
  - `username`, `password`, `display_name`, `role`.
- Expected response:
  - Created user id in `id`, `user_id`, or `userId`.
  - Optional username, display name, and access token.

### Add quota

- Endpoint: `POST /api/user/manage`
- Request headers:
  - Admin `Authorization`.
  - Admin `New-Api-User`.
- Request body:
  - `id`: target NewAPI user id as a number.
  - `action`: `add_quota`.
  - `mode`: `add` by default; portal types also allow `subtract` and `override`.
  - `value`: integer quota amount.
- Expected response:
  - Any successful NewAPI response is accepted and stored as upstream data.

## Token management

All token operations use user `Authorization` and `New-Api-User` headers.

- List tokens: `GET /api/token/?p=<page>&size=<size>`.
  - Expected page fields: `items`, `total`, and optionally `page`, `page_size`, `pageSize`, or `p`.
- Get token: `GET /api/token/{id}`.
- Create token: `POST /api/token/`.
  - Request fields may include `name`, `expired_time`, `remain_quota`, `unlimited_quota`, `model_limits_enabled`, `model_limits`, `allow_ips`, `group`, and `cross_group_retry`.
  - Portal BFF input also accepts `remain_quota_cny`; this is converted to integer `remain_quota` before calling NewAPI and is never forwarded upstream.
  - Expected response may include a token object and may include the key as `key`, `token_key`, or `tokenKey`.
- Update token: `PUT /api/token/`.
  - Same editable fields as create, plus `id` and optional `status`.
  - The portal sends sparse patch payloads containing only `id` and requested editable fields. NewAPI must not require a full token object for ordinary edits.
- Delete token: `DELETE /api/token/{id}`.
- Reveal key: `POST /api/token/{id}/key`.
  - Expected response data must include non-empty `key`.
  - If create does not return a key, the portal lists recent tokens by name and calls reveal key for the matching token id.

Token objects are expected to include `id` and `name`; the portal also displays `key`, `status`, `created_time`, `accessed_time`, `expired_time`, `remain_quota`, `unlimited_quota`, `model_limits_enabled`, `model_limits`, `allow_ips`, `used_quota`, `group`, and `cross_group_retry` when present.

### Portal BFF token routes

The browser must call the portal BFF only. It must not call NewAPI hosts directly.

- List tokens: `GET /api/tokens?p=<page>&size=<size>`.
- Create token: `POST /api/tokens`.
  - Request fields mirror the editable NewAPI token fields above.
  - `remain_quota_cny` is accepted as a browser-facing convenience field. If `remain_quota` is absent, the BFF converts CNY to NewAPI quota units with `QUOTA_PER_CNY`; if both are present, `remain_quota` wins.
  - `group` is optional and, when present, must be one of the portal channel tier groups.
  - Response envelope: `{ "ok": true, "data": { "token": <masked token>, "key": <full key or null>, "keyReturnedOnce": <boolean> } }`.
- Update token: `PUT /api/tokens/{id}`.
  - Supports partial updates for `name`, `expired_time`, `remain_quota`, `unlimited_quota`, `model_limits_enabled`, `model_limits`, `allow_ips`, `group`, `cross_group_retry`, and `status`.
  - The BFF calls NewAPI `PUT /api/token/` with a sparse patch containing only `id` and the request body fields. If upstream returns no token object, the BFF loads the token after the update only to build the masked response.
  - Response envelope: `{ "ok": true, "data": { "token": <masked token> } }`.
- Delete token: `DELETE /api/tokens/{id}`.
- Validation errors use `{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "请求参数无效", "details": ... } }`.
- NewAPI binding errors use `409` with Chinese `message` values such as `NewAPI 账号绑定仍在处理中`.
- NewAPI upstream failures use stable BFF envelopes only: `{ "ok": false, "error": { "code": "NEWAPI_ERROR", "message": "上游 NewAPI 请求失败", "details": { "status": <status>, "code": <code> } } }`. Raw upstream `message` and payload text are only available in server-side logs and must not be returned to the browser.

### Portal channel tiers

The portal exposes fixed user-facing channel metadata from `GET /api/channels/tiers`.

The labels, descriptions, and stability copy are fixed for the user. The NewAPI `group` values can be overridden by environment variables for operations:

- `NEWAPI_CHANNEL_GROUP_LOW` defaults to `budget`.
- `NEWAPI_CHANNEL_GROUP_STANDARD` defaults to `normal`.
- `NEWAPI_CHANNEL_GROUP_PREMIUM` defaults to `stable`.

`GET /api/channels/tiers`, create/update token validation, and dev mock token routes all use the same parsed channel group mapping.

| Label | Group sent to NewAPI | Stability copy | Default |
|-------|----------------------|----------------|---------|
| 低价渠道 | `budget` | `~50% 在线` | No |
| 一般渠道 | `normal` | `~80% 在线` | Yes |
| 高价渠道 | `stable` | `~99.9% 在线` | No |

The response envelope is:

```json
{
  "ok": true,
  "data": {
    "tiers": [
      {
        "id": "low",
        "label": "低价渠道",
        "group": "budget",
        "stability": "~50% 在线",
        "description": "低成本，适合非关键任务或可重试场景。"
      }
    ],
    "defaultGroup": "normal"
  }
}
```

### Playground chat token policy

- Portal-managed Chat tokens use the general channel group. The default group value is `auto`; override `PLAYGROUND_CHAT_GROUP` only when the deployed NewAPI/BFF mapping names the general channel differently.
- Chat tokens must keep `cross_group_retry: true`.
- Portal does not encode fallback order. Configure NewAPI `auto` so the recommended operational order is `normal` first, then `budget`, then `stable` or other operator-approved fallback groups.

## Billing and top-up

### Redemption code top-up

- Endpoint: `POST /api/user/topup`
- Request headers:
  - `Authorization`.
  - `New-Api-User`.
- Request body:
  - `key`: redemption code.
- Expected response:
  - Any successful NewAPI response is accepted. The portal tries to infer quota from response keys such as `quota`, `quota_amount`, `quotaAmount`, `topup_quota`, or `topupQuota`.

### Payment creation

- Endpoint: `POST /api/user/pay`
- Request headers:
  - `Authorization`.
  - `New-Api-User`.
- Request body:
  - `amount`: NewAPI top-up amount.
  - `payment_method`: for example `alipay` or `wxpay`.
  - `return_url`: portal return URL.
- Expected response:
  - `message` is absent or `success`.
  - Payment URL or form data is present in the response. The portal stores the upstream payment metadata with the local order.
- EPay notify callbacks belong to NewAPI. Payment gateway callback URLs should target `/api/user/epay/notify` on the public NewAPI deployment, not the portal.

## Usage and logs

All usage and log operations use user `Authorization` and `New-Api-User` headers.

- Logs: `GET /api/log/self`.
  - Query: `p`, `page_size`, `type`, `token_name`, `model_name`, `start_timestamp`, `end_timestamp`, `group`, `request_id`.
  - Expected page fields: `items`, `total`, and optional page metadata.
  - Log item fields displayed or aggregated by the portal include `id`, `user_id`, `created_at`, `type`, `content`, `username`, `token_name`, `model_name`, `quota`, `prompt_tokens`, `completion_tokens`, `use_time`, `is_stream`, `channel`, `group`, and `request_id`.
- Log stats: `GET /api/log/self/stat`.
  - Query: `type`, `token_name`, `model_name`, `start_timestamp`, `end_timestamp`, `group`.
  - Expected fields include `quota`, and optionally `rpm` and `tpm`.
- Usage data: `GET /api/data/self`.
  - Query: `start_timestamp`, `end_timestamp`, and optional `default_time`.
  - Expected item fields include `created_at`, `token_used`, `count`, `quota`, `model_name`, `username`, and `user_id`.

## Migration risk notes for official upstream NewAPI

- Confirm the official upstream still requires both `Authorization` and `New-Api-User`. The portal currently sends both for every authenticated user and admin request.
- Confirm `/api/user/token` can still mint or return an access token from the login session cookie and `New-Api-User` header. Login depends on this fallback when `/api/user/login` does not return an access token directly.
- Confirm response envelope behavior. The portal unwraps `data` when `success` exists, and treats `success: false` as an error.
- Confirm token creation and reveal-key behavior. If official upstream changes create responses or disables `/api/token/{id}/key`, portal token display after creation will need adjustment.
- Confirm admin `POST /api/user/manage` with `action: add_quota` and quota modes remains stable before moving registration reward, check-in reward, invite reward, and manual quota flows.
- Confirm payment response shape for `/api/user/pay`, and ensure gateway notify callbacks are configured on the NewAPI public URL.
- Confirm log and usage timestamp units. The portal passes integer Unix timestamps and aggregates `quota`, request count, and token usage from returned fields.
