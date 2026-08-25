# Security

Tenant Evidence Kit is security-sensitive infrastructure. The reference migration is intentionally small, but adopting teams remain responsible for their product's authorization model, data classification, retention obligations, and operational controls.

## Supported runtime

Tenant Evidence Kit supports Node.js 22.12 and later. Keep Node.js and
`@supabase/supabase-js` on supported versions, and use the package in a
browser only through a build tool that supports the package's ESM output.

## Reference security properties

The included Supabase migration is designed around these properties:

- the Storage bucket is private;
- authenticated membership is checked in Postgres, not trusted from client input;
- evidence metadata uses Row Level Security;
- Storage object access derives tenant scope from the object path and verifies membership server-side;
- browser clients are expected to use a publishable/anon key under RLS, never a service-role key;
- signed URLs are temporary access artifacts, not permanent public links.

## RLS execution boundary

The isolation guarantees above assume queries run as database roles that are
subject to Row Level Security, such as Supabase's `authenticated` role. The
`service_role` credential bypasses RLS and must remain in trusted server-side
code. PostgreSQL table owners and roles with `BYPASSRLS` can also bypass RLS
(unless a table is configured with `FORCE ROW LEVEL SECURITY`). Operations run
through any of those privileged identities are outside the toolkit's tenant
isolation boundary and require separate authorization controls.

## Important production decisions left to adopters

Before production use, decide and test:

- who can invite, deactivate, and remove tenant members;
- whether every tenant member may read every evidence item;
- allowed MIME types and maximum upload sizes;
- malware scanning requirements;
- retention and deletion rules;
- audit-log requirements;
- backup and disaster-recovery policy;
- whether evidence is regulated or sensitive personal data in your jurisdiction;
- whether additional encryption or regional data-residency controls are required.

## Storage + database consistency

An object upload and a Postgres insert do not share one cross-service transaction. `uploadEvidence()` therefore attempts compensation: if metadata registration fails after a successful object upload, it attempts to remove the uploaded object before returning an error.

Applications should monitor failures where that cleanup attempt also fails. `TenantEvidenceError.cleanupError` is exposed for this reason.

## Reporting a vulnerability

Please do not open a public issue containing exploit details, credentials, private object URLs, or real user data.

Until a dedicated security contact is established, report privately through the repository owner's GitHub profile/contact channel and include:

- affected version/commit;
- reproduction steps using synthetic data;
- expected and observed authorization behavior;
- suggested remediation, if known.

Never include production credentials or real sensitive evidence in a report.
