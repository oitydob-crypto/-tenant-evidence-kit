# Storage and Postgres consistency

Supabase Storage and Postgres do not share one transaction. Tenant Evidence
Kit therefore exposes a compensated workflow rather than claiming atomicity.

## Upload state machine

```text
             upload fails
request --------------------> UPLOAD_FAILED
  |
  v
OBJECT_UPLOADED
  |
  +-- metadata present ------> COMPLETED
  |
  +-- metadata response ambiguous
  |       |
  |       +-- row matches ---> COMPLETED (reconciled)
  |       +-- row absent ----> cleanup object
  |       |                       |
  |       |                       +-- success -> METADATA_FAILED
  |       |                       +-- failure -> CLEANUP_FAILED
  |       +-- lookup unknown -> RECONCILIATION_FAILED
```

The metadata lookup is authoritative for deciding whether the insert completed.
The object is removed only after reconciliation proves that the metadata row is
absent. If the state cannot be determined, the object is preserved so a
trusted operator can retry reconciliation rather than deleting a possibly
valid evidence object.

## Compensation authority

An ordinary authenticated member can upload and read evidence but cannot delete
objects in the reference policy. Therefore a server-side upload path should
pass a trusted `compensationClient`. A service-role client is acceptable only
inside a trusted server process or job; it must never be shipped to a browser.

Applications should alert on `CLEANUP_FAILED` and `RECONCILIATION_FAILED`, retain
the evidence ID and path, and provide a controlled reconciliation job. The core
kit does not invent retention, legal hold, or business deletion semantics.

