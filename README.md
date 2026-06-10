# EasyAPI Portal

Frontend portal for EasyAPI, targeting the official upstream [NewAPI](https://github.com/QuantumNous/new-api) backend. The portal-to-NewAPI API contract is documented in [docs/newapi-contract.md](docs/newapi-contract.md).

> Product note: this portal currently does not ship formal user terms, privacy policy, or user conduct pages. Do not add registration-time legal/terms acceptance gates unless the corresponding product/legal content exists and has been approved.

## Architecture constraint: UI shell only

**Portal must operate as a UI shell (at minimum).** This is a hard product and engineering constraint, not an optional pattern.

### What Portal is

- A **branded user interface** and **BFF** (`/api/*`) in front of NewAPI
- A **security boundary** that keeps the NewAPI admin surface and raw upstream hosts out of the browser
- An **experience layer** for items NewAPI does not own (channel tier copy, Playground proxy, CNY display helpers, Chinese error envelopes)

### What Portal is not

Portal must **not** become a second system of record for user business data. The following are **forbidden** as authoritative Portal-local state:

| Domain | System of record | Portal must not |
|--------|------------------|-----------------|
| User identity & credentials | NewAPI | Store standalone passwords for new users or bypass NewAPI auth |
| Quota / balance | NewAPI `GET /api/user/self` | Maintain a parallel balance ledger that drives UI truth |
| API keys / tokens | NewAPI `/api/token/*` | Persist keys in Portal SQL |
| Check-in | NewAPI `/api/user/checkin` | Reimplement check-in in Prisma + admin `add_quota` |
| Referrals / affiliate | NewAPI `aff_code`, `/api/user/aff`, `/api/user/aff_transfer` | Run a separate invite-code and referral reward system |
| Redemption top-up | NewAPI `POST /api/user/topup` | Apply quota locally instead of proxying upstream |
| Online payment | NewAPI `POST /api/user/pay`; notify on NewAPI | Handle payment gateway notify callbacks |
| Usage & logs | NewAPI log/data APIs | Aggregate authoritative usage from Portal DB |

### Allowed Portal-local storage (thin layer only)

After UI-shell migration, Portal PostgreSQL may only hold:

- **Session bridge** — HttpOnly portal session and encrypted NewAPI access token reference
- **User binding** — `newApiUserId` and display fields linked to the upstream user
- **Optional non-authoritative audit** — debug/support logs that are not used as billing or quota truth

Any new feature proposal must answer: *which NewAPI endpoint owns the data?* If none exists, the feature belongs in NewAPI first, or stays as pure presentation logic in the BFF.

### Request flow (required)

```
Browser (apiFetch) → Portal BFF (/api/*) → NewAPI
```

The browser must not call NewAPI hosts directly for authenticated product flows.

### PRD and reviews

- Migration plan: **[docs/portal-ui-shell-prd.md](docs/portal-ui-shell-prd.md)**
- API contract: **[docs/newapi-contract.md](docs/newapi-contract.md)**
- Model access MVP: **[docs/easyapi-model-access-prd.md](docs/easyapi-model-access-prd.md)**

Pull requests that introduce Portal-local business tables, admin quota grants on user hot paths, or duplicate NewAPI features should be rejected unless the PR explicitly documents an approved exception in the UI-shell PRD.

## Test environment deployment

Staging runs at **https://test.easyapi.work**. Pull requests to `dev` / `main` run [`.github/workflows/portal-ci.yml`](.github/workflows/portal-ci.yml) (lint, unit tests, build). Pushes to `dev` or `main` that touch `newapi-portal/` trigger [`.github/workflows/portal-cd.yml`](.github/workflows/portal-cd.yml) (deploy → seed → Playwright UI verification). `dev` also restores a production DB snapshot before deploy. See:

**[docs/test-deploy-easyapi-portal.md](docs/test-deploy-easyapi-portal.md)**

Application code lives in [`newapi-portal/`](newapi-portal/).
