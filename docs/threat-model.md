# Threat model and trust boundaries

## Protected assets

- evidence bytes in the private Storage bucket;
- evidence metadata and tenant membership rows;
- temporary signed URLs;
- the trusted compensation credential.

## Main threats and controls

| Threat | Control |
| --- | --- |
| Cross-tenant metadata read or write | Postgres RLS checks active membership and tenant ID. |
| Cross-tenant Storage access | Storage policies derive tenant scope from the first object-path segment. |
| Metadata pointer to another tenant | Migration `0003_audit_hardening.sql` requires the path tenant UUID to match the row. |
| Long-lived bearer URL | The client enforces a maximum signed URL lifetime of 900 seconds. |
| Path traversal or arbitrary bucket/table target | IDs, file paths, bucket names, and table identifiers are validated. |
| Orphan after metadata failure | Reconciliation precedes compensation; ambiguous state is preserved and surfaced. |
| Malformed provider response | Evidence rows and kinds are runtime-validated. |
| Credential misuse | Service-role compensation is documented as server-only. |

## Assumptions

RLS applies to authenticated application clients. Service-role clients, table
owners, and roles with `BYPASSRLS` are outside that boundary and require the
consuming application's own authorization controls.

This document does not claim to provide malware scanning, retention, backup,
disaster recovery, business permissions, or regulated-record compliance.

