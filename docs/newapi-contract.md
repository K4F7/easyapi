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
  - Expected response may include a token object and may include the key as `key`, `token_key`, or `tokenKey`.
- Update token: `PUT /api/token/`.
  - Same editable fields as create, plus `id` and optional `status`.
- Delete token: `DELETE /api/token/{id}`.
- Reveal key: `POST /api/token/{id}/key`.
  - Expected response data must include non-empty `key`.
  - If create does not return a key, the portal lists recent tokens by name and calls reveal key for the matching token id.

Token objects are expected to include `id` and `name`; the portal also displays `key`, `status`, `created_time`, `accessed_time`, `expired_time`, `remain_quota`, `unlimited_quota`, `model_limits_enabled`, `model_limits`, `allow_ips`, `used_quota`, `group`, and `cross_group_retry` when present.

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
