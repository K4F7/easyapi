# EasyAPI Portal

Frontend portal for EasyAPI, targeting the official upstream [NewAPI](https://github.com/QuantumNous/new-api) backend. The portal-to-NewAPI API contract is documented in [docs/newapi-contract.md](docs/newapi-contract.md).

> Product note: this portal currently does not ship formal user terms, privacy policy, or user conduct pages. Do not add registration-time legal/terms acceptance gates unless the corresponding product/legal content exists and has been approved.

## Test environment deployment

Staging runs at **https://test.easyapi.work**. Pull requests to `dev` / `main` run [`.github/workflows/portal-ci.yml`](.github/workflows/portal-ci.yml) (lint, unit tests, build). Pushes to `dev` or `main` that touch `newapi-portal/` trigger [`.github/workflows/portal-cd.yml`](.github/workflows/portal-cd.yml) (deploy → seed → Playwright UI verification). `dev` also restores a production DB snapshot before deploy. See:

**[docs/test-deploy-easyapi-portal.md](docs/test-deploy-easyapi-portal.md)**

Application code lives in [`newapi-portal/`](newapi-portal/).
