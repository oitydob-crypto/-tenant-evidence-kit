# Testing guide

## Local package checks

```bash
npm install
npm run check
```

The check runs TypeScript validation, unit tests, the production build, and an
install-from-tarball package smoke test. The smoke test imports the package by
its public name from Node.js, so extensionless ESM output cannot pass silently.

## Storage integration

The repository contains pgTAP policy tests and an optional local Supabase
integration suite. Use synthetic data only.

```bash
supabase start
supabase test db
TEK_STORAGE_INTEGRATION=1 npm run test:integration
```

The integration suite requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`. It creates two authenticated users and tenants,
then verifies same-tenant upload/list/download/signed access and cross-tenant
read/list/sign/delete denial, including signed URL expiry.

The CI workflow starts a clean local Supabase stack, exports its local keys,
and runs the integration suite. A local run without the environment flag keeps
the suite skipped rather than pretending that Storage behavior was tested.

