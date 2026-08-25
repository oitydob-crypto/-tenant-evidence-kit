# Tenant Evidence Kit

A small TypeScript toolkit for **private, multi-tenant evidence workflows with Supabase**.

**npm:** [`tenant-evidence-kit`](https://www.npmjs.com/package/tenant-evidence-kit) · **latest:** `0.1.3`

It provides a reference architecture for a common problem: an application needs to attach photos, documents, or other evidence to a business object without making files public, leaking tenant data, or duplicating authorization rules across the UI and storage layer.

## What it does

- scopes every object by **tenant → subject → evidence object**;
- uploads files to a **private Supabase Storage bucket**;
- stores evidence metadata separately from file bytes;
- uses **Row Level Security (RLS)** for tenant isolation;
- creates short-lived **signed URLs** instead of permanent public links;
- compensates for a metadata failure by removing the uploaded object;
- ships reference SQL migrations for tenant bootstrap, membership, evidence metadata, authorization, and Storage policies;
- stays intentionally small: it does not impose a CRM, healthcare, rental, document, or workflow domain model.

## Why this exists

Private evidence is easy to demo and surprisingly easy to get wrong in a real multi-tenant product. A public bucket, a tenant id trusted only by the client, or metadata stored in two places can create avoidable privacy and consistency problems.

Tenant Evidence Kit keeps the reusable infrastructure separate from the product that consumes it.

## Status

**v0.1.3 — early public release.**

The core path, upload, metadata, listing, signed-access flow, reference RLS model, operation-specific authorization, upgrade migration, and local Supabase authorization tests are present. The API may still evolve before 1.0.

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

Signed URLs are intentionally short-lived. The reference default is 5 minutes.

### 7. List evidence for a subject

```ts
const records = await evidence.listEvidence({
  tenantId,
  subjectId: operationId,
});
```

## Security model

The reference implementation follows five rules:

1. **The bucket is private.** No permanent public URL is generated.
2. **Permissions are checked server-side.** Storage policies derive the tenant from the first object-path segment and require the authenticated user's active role to grant the requested operation.
3. **Metadata is protected by RLS.** A client-provided `tenantId` alone never grants access.
4. **Service-role credentials stay server-side.** Normal application flows are expected to use authenticated Supabase clients.
5. **Evidence is append-only.** Metadata can be created, read, or deliberately deleted, but it cannot be updated in place.

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
- explicit blocking of in-place evidence updates.

These database authorization tests run in CI alongside typechecking, unit tests, and the package build.

## Consistency across Storage and Postgres

Supabase Storage and Postgres do not participate in one shared database transaction. The upload flow therefore uses a compensation strategy:

```text
upload private object
        ↓
insert protected metadata
        ↓
metadata fails? → attempt object cleanup → return typed error
```

This is deliberately described as **compensated consistency**, not as a false cross-service atomic transaction.

## Release security

Package releases are published from GitHub Actions through npm **Trusted Publishing (OIDC)**. The repository does not require a long-lived npm publish token for the release workflow.

Before publishing, the workflow:

- installs dependencies;
- runs typecheck, tests, and build;
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
tests/
  path.test.ts
examples/
  basic.ts
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

Or run everything:

```bash
npm run check
```

To run the database authorization suite locally:

```bash
supabase start
supabase test db
```

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
