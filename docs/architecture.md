# Architecture and trust boundaries

Tenant Evidence Kit separates **file bytes**, **evidence metadata**, and **authorization truth** rather than treating a Storage URL as the evidence record.

## Data flow

```text
authenticated user
       │
       ▼
Supabase client
       │
       ├── upload ──► private Storage bucket
       │               tenant / subject / object-file
       │
       └── insert ──► tek_evidence metadata
                         │
                         └── RLS checks tenant membership
```

Temporary reads follow a separate path:

```text
user requests evidence
       │
       ▼
metadata read under RLS
       │
       ▼
createSignedUrl(file_path)
       │
       ▼
short-lived Storage URL
```

## Sources of truth

The reference implementation assigns one responsibility to each layer:

- `tek_tenant_memberships`: authorization truth for the reference schema;
- `tek_evidence`: evidence metadata and relationship to a subject;
- Supabase Storage: file bytes;
- signed URL: temporary access artifact only, never canonical state.

A consuming product should not duplicate these facts into additional convenience tables unless it has a separate, explicit reason to own them.

## Object paths

The default object path is:

```text
{tenantId}/{subjectId}/{objectId}-{sanitizedFileName}
```

The first segment is security-relevant: Storage policies derive tenant scope from it and verify authenticated membership in Postgres.

`objectId` prevents a filename from becoming the object identity. The original/sanitized filename remains useful for inspection without being trusted as an authorization primitive. The client requires UUID tenant/object IDs and a safe subject segment; the audit migration also requires the first path segment to match `tek_evidence.tenant_id`.

## Cross-service consistency

Storage and Postgres do not share one transaction boundary. The toolkit therefore does not claim atomicity across them.

For upload:

```text
1. upload object
2. insert metadata
3. reconcile an ambiguous metadata response
4. if the row is absent, attempt object removal with trusted compensation authority
5. if cleanup fails, expose cleanupError
```

If reconciliation is unknown, the object is preserved and a retryable reconciliation error is returned. This gives the consuming application enough information to alert, reconcile, or retry rather than silently deleting a possibly valid object or leaving an untracked orphan.

## What RLS protects

The reference migration protects:

- tenant rows from non-members;
- evidence metadata with explicit `evidence.read`, `evidence.create`, and `evidence.delete` permission checks;
- Storage object upload/read/delete with the same operation-specific checks for the tenant encoded in the object path;
- sensitive deletion by granting it only to active `owner` and `admin` memberships while preserving read/create access for other active roles.

A client cannot grant itself access by sending another tenant id because role and permission are checked against `auth.uid()` inside Postgres. Unsupported roles and permission names deny access rather than falling back to general membership.

Installations that already applied the original schema must also apply
`0002_authorization_hardening.sql` and `0003_audit_hardening.sql`. The latter
validates the tenant/path invariant without requiring membership data to be
rewritten.

## Evidence mutability

`tek_evidence` is append-only by design. The migration both omits an `UPDATE` RLS policy and revokes the table-level `UPDATE` privilege from application roles. This makes the intended semantics auditable instead of relying only on an accidental missing policy.

Creation records a new observation and remains available to active members. Owners and admins may delete, letting products implement deliberate removal workflows. Both operations are applied consistently to metadata and file bytes. Corrections, annotations, retention rules, and supersession are domain concerns and should be modeled as new facts rather than rewriting an evidence record.

## Extension boundary

The bundled tenant/membership model exists so the reference setup is runnable. Applications that already own tenant identity should not copy their membership data into TEK. A bring-your-own authorization contract is tracked on the public roadmap.
