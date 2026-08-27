# Tenant Evidence Kit

A small TypeScript toolkit for **private, multi-tenant evidence workflows with Supabase**.

**npm:** [`tenant-evidence-kit`](https://www.npmjs.com/package/tenant-evidence-kit) · **current public:** `0.1.3` · **next release:** `0.2.0`

It provides a reference architecture for a common problem: an application needs to attach photos, documents, or other evidence to a business object without making files public, leaking tenant data, or duplicating authorization rules across the UI and storage layer.

## What it does

- scopes every object by **tenant → subject → evidence object**;
- uploads files to a **private Supabase Storage bucket**;
- stores evidence metadata separately from file bytes;
- uses **Row Level Security (RLS)** for tenant isolation;
- creates short-lived **signed URLs** instead of permanent public links;
- compensates for a metadata failure only after reconciliation proves the row is absent;
- supports a trusted server-side compensation client for ordinary members that cannot delete Storage objects;
- validates IDs, paths, response rows, evidence kinds, bucket/table identifiers, and signed URL lifetimes;
- ships reference SQL migrations for tenant bootstrap, membership, evidence metadata, authorization, and Storage policies;
- stays intentionally small: it does not impose a CRM, healthcare, rental, document, or workflow domain model.

## Why this exists

Private evidence is easy to demo and surprisingly easy to get wrong in a real multi-tenant product. A public bucket, a tenant id trusted only by the client, or metadata stored in two places can create avoidable privacy and consistency problems.

Tenant Evidence Kit keeps the reusable infrastructure separate from the product that consumes it.

## Status

**0.2.0 — audit-hardening release candidate.**

The current public npm release remains `0.1.3`. This branch corrects the distributed ESM import path, hardens Storage/metadata consistency, validates the public API at runtime, adds Storage integration tests, and pins the release toolchain. The API remains pre-1.0 and may evolve before 1.0.

## Requirements

- Node.js 22.12+
- TypeScript 5+
- Supabase JS 2.x
- a Supabase project with Auth, Postgres, and Storage

## Quick start

### 1. Apply the reference migrations

For a new installation, apply the migrations in order:

```text
supabase/migrations/0001_tenant_evidence.sql
supabase/migrations/0002_authorization_hardening.sql
supabase/migrations/0003_audit_hardening.sql
```

If you already applied the schema shipped in `0.1.3`, apply only:

```text
supabase/migrations/0003_audit_hardening.sql
```

If you already applied the schema shipped before v0.1.3, apply only the upgrade migration:

```text
supabase/migrations/0002_authorization_hardening.sql
```

The migrations create and configure:

```text
tek_tenants
tek_tenant_memberships
tek_evidence
tenant-evidence-private (private Storage bucket)
```

They also create the `tek_create_tenant()` RPC and RLS policies that verify an active tenant role and an explicit operation permission for database rows and Storage objects.

### 2. Install

Install the published package from npm:

```bash
npm install tenant-evidence-kit
```

For local development of this repository:

```bash
npm install
npm run check
```

### 3. Create the client and kit

```ts
import { createClient } from "@supabase/supabase-js";
import { createTenantEvidenceKit } from "tenant-evidence-kit";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const evidence = createTenantEvidenceKit(supabase);
```

Use the **publishable/anon client key**, not a service-role key in browser code. RLS is the security boundary.

For a trusted server-side upload path, pass a separate compensation client:

```ts
const evidence = createTenantEvidenceKit(authenticatedClient, {
  compensationClient: serverOnlyServiceRoleClient,
});
```

Never expose `serverOnlyServiceRoleClient` or its credential to browser code.

### 4. Bootstrap a tenant

An authenticated user can create a tenant and become its first owner through the reference RPC:

```ts
const { data: tenantId, error } = await supabase.rpc("tek_create_tenant", {
  tenant_name: "Example Company",
});
```

### 5. Upload private evidence

```ts
const record = await evidence.uploadEvidence({
  tenantId,
  subjectId: operationId,
  body: file,
  fileName: "after-service.jpg",
  contentType: "image/jpeg",
  kind: "photo",
  note: "Captured after completion",
});
```

The object path is deterministic in shape but opaque at the object level:

```text
{tenantId}/{subjectId}/{objectId}-{sanitizedFileName}
```

The file remains private. The metadata row contains the reference; it does not duplicate the file.

### 6. Request temporary access

```ts
const { url } = await evidence.createSignedEvidenceUrl({
  filePath: record.filePath,
  expiresInSeconds: 120,
});
```

Signed URLs are intentionally short-lived. The default is 5 minutes and the hard maximum is 15 minutes.

### 7. List evidence for a subject

```ts
const records = await evidence.listEvidence({
  tenantId,
  subjectId: operationId,
});
```

## Security model

The reference implementation follows these rules:

1. **The bucket is private.** No permanent public URL is generated.
2. **Permissions are checked server-side.** Storage policies derive the tenant from the first object-path segment and require the authenticated user's active role to grant the requested operation.
3. **Metadata is protected by RLS.** A client-provided `tenantId` alone never grants access.
4. **Service-role credentials stay server-side.** The optional compensation client is for trusted server processes only.
5. **Evidence is append-only.** Metadata can be created, read, or deliberately deleted, but it cannot be updated in place.
6. **Metadata paths are bound to their tenant.** Migration `0003_audit_hardening.sql` rejects a row whose first path segment does not match `tenant_id`.
7. **Public inputs and provider responses are validated.** Malformed paths, identifiers, evidence kinds, rows, and signed URL lifetimes fail closed.

### Reference roles and permissions

The bundled schema assigns sensitive deletion to `owner` and `admin`. Other active membership roles retain the existing read/create behavior for backward compatibility; unknown permission names fail closed.

| Role | Read evidence | Create evidence | Delete evidence |
| --- | --- | --- | --- |
| `owner` | yes | yes | yes |
| `admin` | yes | yes | yes |
| `member` (or a custom active role) | yes | yes | no |

Deletion is the sensitive operation reserved for owners and admins. Active members retain read and creation access, preserving the behavior of earlier releases. The metadata and Storage policies use the same permission for each operation, so an ordinary member cannot delete either side independently. Changing a record is intentionally not a permission at all. If facts need correcting, the consuming product should preserve the original evidence and append a new record or use an application-specific supersession model.

See [SECURITY.md](SECURITY.md) before using the reference migrations in production.

## Authorization tests

The repository includes local Supabase/pgTAP tests for the authorization boundary. They cover:

- owner/admin evidence deletion;
- ordinary-member delete denial;
- same-tenant read/create access;
- cross-tenant read/insert/update/delete denial;
- explicit blocking of in-place evidence updates;
- Storage object upload/read/list/delete policy behavior;
- same-tenant and cross-tenant Storage integration behavior, including signed URL expiry.

The database and package authorization tests run in CI alongside typechecking, unit tests, the build, and the package smoke test.

## Consistency across Storage and Postgres

Supabase Storage and Postgres do not participate in one shared database transaction. The upload flow therefore uses reconciliation and compensated cleanup:

```text
upload private object
        ↓
reconcile metadata response
        ↓
metadata present? → return record
        ↓ absent
trusted cleanup client removes object
        ↓
typed result with retry/reconciliation state
```

If reconciliation is unknown, the object is preserved and `TenantEvidenceError` reports `RECONCILIATION_FAILED`. If cleanup fails, the error reports `CLEANUP_FAILED` and exposes `cleanupError`. See [docs/consistency.md](docs/consistency.md).

## Release security

Package releases are published from GitHub Actions through npm **Trusted Publishing (OIDC)**. The repository does not require a long-lived npm publish token for the release workflow.

Before publishing, the workflow:

- uses pinned Node.js 22.12.0 and npm 10.9.2;
- installs dependencies and runs typecheck, tests, build, and package smoke test;
- verifies that the GitHub release tag matches the version in `package.json`;
- publishes to npm only after those checks pass.

## What this project does not do

Tenant Evidence Kit does not provide:

- business-specific permissions;
- clinical or legal record semantics;
- document signing;
- image processing;
- retention-policy automation;
- virus scanning;
- a full tenant administration UI.

Those concerns should remain in the consuming product or be added as optional adapters when there is evidence they belong here.

## Project structure

```text
src/
  errors.ts
  kit.ts
  path.ts
  types.ts
  index.ts
supabase/
  migrations/
    0001_tenant_evidence.sql
    0002_authorization_hardening.sql
  tests/
    authorization.test.sql
    storage_authorization.test.sql
tests/
  path.test.ts
examples/
  basic.mjs
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run package:smoke
```

Or run everything:

```bash
npm run check
```

To run the database authorization suite locally:

```bash
supabase start
supabase test db
TEK_STORAGE_INTEGRATION=1 npm run test:integration
```

See [docs/testing.md](docs/testing.md) for the local keys required by the Storage integration suite.

## Roadmap

The immediate roadmap is intentionally narrow:

- bring-your-own tenant/membership authorization adapter;
- safe delete workflow with compensation and audit metadata;
- durability/reconciliation improvements for partial Storage/Postgres failures;
- framework examples after the core API stabilizes.

Roadmap work is tracked in GitHub Issues.

## Contributing

Issues and focused pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
