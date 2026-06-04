# EasyAPI Portal

Frontend portal for EasyAPI, targeting the official upstream [NewAPI](https://github.com/QuantumNous/new-api) backend. The portal-to-NewAPI API contract is documented in [docs/newapi-contract.md](docs/newapi-contract.md).

## Test environment deployment

Staging runs at **https://test.easyapi.work**. Pushes to `dev` that touch `newapi-portal/` trigger [`.github/workflows/portal-staging.yml`](.github/workflows/portal-staging.yml) (restore production DB snapshot → deploy `portal-test` → seed screenshot user). `main` only redeploys the portal container. See:

**[docs/test-deploy-easyapi-portal.md](docs/test-deploy-easyapi-portal.md)**

Application code lives in [`newapi-portal/`](newapi-portal/).
