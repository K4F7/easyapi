# EasyAPI Portal

This repository is moving toward a frontend-only portal. The backend target is the official upstream NewAPI project, either `QuantumNous/new-api` or the compatible `calciumion/new-api` image. The old `xbh-new-api` backend is transitional/reference-only material and should not be treated as the future production backend.

The current portal-to-NewAPI API contract is tracked in [docs/newapi-contract.md](docs/newapi-contract.md).

## Migration to official NewAPI

### Target architecture

Current transitional architecture:

- `newapi-portal`: the frontend portal and its local portal schema.
- `xbh-new-api`: reference backend only, kept for compatibility comparison during migration.
- PostgreSQL stores both NewAPI backend data and the portal-owned schema when deployed together.

Target architecture:

- `newapi-portal` remains the frontend portal in this repository.
- Official NewAPI runs from `QuantumNous/new-api` or `calciumion/new-api`.
- The portal points to official NewAPI through `NEWAPI_BASE_URL`.
- The portal schema stays separate from NewAPI tables, for example `DATABASE_URL=...?schema=newapi_portal`, while official NewAPI continues to own the default/public backend schema.

### Do not test against production volume

Do not attach an official NewAPI test instance directly to the production volume or production database.

Reasons:

- Official NewAPI may run migrations or background jobs on startup.
- Mixed old/new backend writes can corrupt quota, token, log, payment, or user state.
- A test instance can accidentally consume production secrets, callbacks, Redis keys, or admin tokens.
- Rehearsal failures need to be disposable; production volumes and databases are not.

Testing and rehearsal must use a restored backup or a cloned volume snapshot. Direct production access is only for the final cutover inside a maintenance window.

### Recommended three-stage process

1. Isolated rehearsal

   Restore a production backup into an isolated database or cloned volume, then run official NewAPI and the portal against that clone. A previous isolated check restored `/opt/xbh-new-api-backups/xbh-new-api-2026-05-23-172431.sql.gz` into a separate test database and confirmed basic official NewAPI + portal compatibility with Playwright passing 5 tests. Treat that as a useful baseline, not as final production proof.

2. Staging rehearsal

   Repeat the migration with a fresh production backup or volume snapshot in a staging environment that mirrors production ports, domains, environment variables, Redis layout, payment callback configuration, and TLS/proxy behavior. Use staging-only secrets and tokens. Verify startup migrations, admin access, login, token creation, dashboard data, logs, and rollback timing.

3. Production cutover

   Schedule a maintenance window. Take final backups, stop writes, start official NewAPI against production data, point the portal to it, verify the checklist below, then reopen traffic. Keep the old backend stopped but recoverable until the new path is stable.

### Data migration

Use one of these approaches:

- Logical backup: `pg_dump` from production and `pg_restore` into an isolated or staging PostgreSQL instance.
- Storage clone: create a volume snapshot clone and attach only the clone to the rehearsal stack.

Keep schema ownership clear:

- Official NewAPI owns its backend tables in the NewAPI schema, normally `public`.
- The portal owns its local tables in the portal schema, for example `newapi_portal`.
- Do not merge portal tables into NewAPI tables manually.
- Do not point rehearsal services at the live production database.

### Compose switch

Use `docker-compose.official-newapi.yml` for the official NewAPI deployment path. The compose file runs `postgres`, `redis`, `new-api`, and `portal`; by default `new-api` uses `calciumion/new-api:latest`.

Key environment variables:

- `NEWAPI_IMAGE`: official NewAPI image, for example `calciumion/new-api:latest`.
- `NEWAPI_BASE_URL`: portal backend URL. Inside the compose network this can be `http://new-api:3000`; outside production routing should use the public/internal official NewAPI URL.
- `PORTAL_DATABASE_URL`: portal database URL with the portal schema, for example `...?schema=newapi_portal`.
- `NEWAPI_ADMIN_TOKEN` and `NEWAPI_ADMIN_USER_ID`: admin credentials used by the portal for admin NewAPI operations.

When switching an existing deployment, replace any old backend URL with the official NewAPI URL in `NEWAPI_BASE_URL`, then restart the portal so it connects to official NewAPI.

### Reverse proxy caching and compression

The repository does not currently include an nginx or OpenResty reverse-proxy config. Configure these at the deployment proxy or CDN layer instead of caching all portal responses uniformly.

Recommended response policy:

- `/_next/static/*`: cache for one year with `Cache-Control: public, max-age=31536000, immutable`.
- Static file extensions such as `.png`, `.svg`, `.webp`, `.ico`, `.woff`, and `.woff2`: cache for one year when filenames are content-addressed or released with cache-busting.
- `/api/*`: do not cache, and preserve `Cache-Control: no-store, max-age=0`.
- `/dashboard/*`, `/login`, and `/register`: treat as user-stateful pages and preserve `Cache-Control: private, no-store, max-age=0`.
- `/`: may be cached briefly at a shared proxy, for example `s-maxage=300, stale-while-revalidate=600`, as long as it stays public and does not render user-specific content.

Enable gzip or Brotli for text assets at the proxy/CDN layer. A typical nginx/OpenResty deployment should compress `text/html`, `text/css`, `application/javascript`, `application/json`, `application/xml`, `image/svg+xml`, and font MIME types, while leaving already-compressed image formats such as PNG, JPEG, AVIF, and WebP uncompressed.

### Production cutover checklist

- Confirm the exact official NewAPI image tag or digest to deploy.
- Take a final PostgreSQL backup and, if applicable, a filesystem or volume snapshot.
- Confirm backup restore works before touching production.
- Put the old backend and portal into maintenance mode or otherwise stop writes.
- Stop scheduled jobs, payment callbacks, or workers that can write through the old backend.
- Start official NewAPI with production secrets and production database access.
- Confirm NewAPI health: `GET /api/status`.
- Start or restart the portal with `NEWAPI_BASE_URL` pointing at official NewAPI.
- Confirm portal health: `GET /api/health`.
- Run Playwright or the agreed smoke suite against production routing.
- Verify login, dashboard, token list/create/reveal, quota display, usage, and logs.
- Watch NewAPI, portal, PostgreSQL, Redis, and reverse-proxy logs.
- Reopen writes only after the above checks pass.

### Verification items

- Database: expected NewAPI tables exist in the backend schema and portal tables exist in `newapi_portal`.
- NewAPI: `/api/status` responds successfully.
- Portal: `/api/health` responds successfully.
- User flows: login, dashboard, token management, usage/logs.
- Admin flows: configured admin user id and token can perform required portal admin actions.
- Billing/callbacks: payment callback URLs target official NewAPI, not the portal.

### Secrets and tokens

- Do not reuse staging or test tokens in production.
- Confirm or regenerate `NEWAPI_ADMIN_TOKEN` after migration.
- Confirm `NEWAPI_ADMIN_USER_ID` matches the production admin user.
- Use production-only `SESSION_SECRET`, `CRYPTO_SECRET`, `PORTAL_AUTH_SECRET`, Redis password, database password, and payment secrets.
- Do not let rehearsal instances send production payment callbacks or outbound notifications.

### Rollback

Rollback must be planned before the cutover.

- Keep the old `xbh-new-api` deployment stopped but ready to start.
- Keep the final pre-cutover database backup and volume snapshot.
- If validation fails before reopening writes, stop official NewAPI, restore the pre-cutover state if needed, point `NEWAPI_BASE_URL` back to the old backend, restart the portal, and verify health.
- If writes have already reopened, decide whether to roll forward or restore from the pre-cutover backup. Do not run both backends writing to the same production database.
- Record any official NewAPI migrations or data changes observed during the failed cutover before choosing the rollback path.
