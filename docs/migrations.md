# Migration guide

Apply the reference migrations in order for a new installation:

```text
supabase/migrations/0001_tenant_evidence.sql
supabase/migrations/0002_authorization_hardening.sql
supabase/migrations/0003_audit_hardening.sql
```

An installation that already has the 0.1.3 schema should apply only
`0003_audit_hardening.sql`. The migration adds a validated check constraint
requiring the first object-path segment to be the same tenant UUID stored in
`tek_evidence.tenant_id`.

The constraint validates existing rows. Before applying it to a database with
manually-created evidence, inspect and repair mismatched metadata pointers
through a controlled migration or reconciliation process. Do not bypass the
constraint or modify `storage.objects` directly as a substitute for the Storage
API.

