# API contract

Tenant Evidence Kit is an ESM package. Consumers on Node.js must import the
published package rather than source files:

```ts
import { createTenantEvidenceKit } from "tenant-evidence-kit";
```

The package requires Node.js 22.12 or later and publishes a Node-compatible
ESM export with explicit `.js` specifiers in its generated files.

## Kit construction

```ts
const kit = createTenantEvidenceKit(supabaseClient, {
  bucket: "tenant-evidence-private",
  table: "tek_evidence",
  compensationClient: trustedServerClient,
});
```

`bucket` accepts one Storage bucket identifier. `table` accepts a simple or
schema-qualified PostgREST identifier. Both are validated and cannot contain
path separators or arbitrary query syntax.

`compensationClient` is optional for backwards-compatible construction, but is
recommended for server-side uploads. It is used only to reconcile metadata and
remove an object after a metadata failure. It may be a service-role client only
inside trusted server-side code. Never put its credentials in browser code.

## Upload

`uploadEvidence()` uploads the private object and then inserts its metadata.
`tenantId` and an optional `objectId` must be UUIDs. `subjectId` must be one
safe path segment. The file name is sanitized before it becomes part of the
Storage path.

When a metadata response is ambiguous, the kit first reconciles by evidence
ID and exact tenant, subject, and path. If the row is present, it returns the
reconciled record. If it is absent, it attempts object cleanup with
`compensationClient`. If reconciliation is unknown, it does not delete the
object and returns a retryable `RECONCILIATION_FAILED` error.

Supplying `objectId` gives a caller a stable idempotency key for retry and
reconciliation. A retry must use the same tenant, subject, object ID, and file
name.

## Listing and signed access

`listEvidence()` validates the tenant and subject scope before querying the
metadata table and validates every returned row, including its path and kind.

`createSignedEvidenceUrl()` accepts only a canonical TEK path and limits the
requested signed URL lifetime to 900 seconds. The default is 300 seconds.

## Errors

All operational failures use `TenantEvidenceError` with:

- `stage`: validation, upload, metadata, cleanup, reconciliation, list, or
  signed-url;
- `code`: a stable machine-readable code;
- `retryable`: whether retry or reconciliation may be appropriate;
- `cause`: the provider error when available;
- `cleanupError`: a failed compensation operation;
- `reconciliation`: `not-attempted`, `not-found`, `present`, or `unknown`;
- `cleanupAttempted`: whether object compensation was attempted.

The kit rejects unknown evidence kinds and malformed provider rows instead of
silently coercing them to `other`.

