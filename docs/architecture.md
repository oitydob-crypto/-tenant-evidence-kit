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

`objectId` prevents a filename from becoming the object identity. The original/sanitized filename remains useful for inspection without being trusted as an authorization primitive.

## Cross-service consistency

Storage and Postgres do not share one transaction boundary. The toolkit therefore does not claim atomicity across them.

For upload:

```text
1. upload object
2. insert metadata
3. if metadata fails, attempt object removal
4. if cleanup also fails, expose cleanupError
```

This gives the consuming application enough information to alert, reconcile, or retry rather than silently leaving an orphaned object.

## What RLS protects

The reference migration protects:

- tenant rows from non-members;
- evidence metadata from non-members;
- Storage object upload/read/delete from users outside the tenant encoded in the object path.

A client cannot grant itself access by sending another tenant id because membership is checked against `auth.uid()` inside Postgres.

## Extension boundary

The bundled tenant/membership model exists so the reference setup is runnable. Applications that already own tenant identity should not copy their membership data into TEK. A bring-your-own authorization contract is tracked on the public roadmap.
