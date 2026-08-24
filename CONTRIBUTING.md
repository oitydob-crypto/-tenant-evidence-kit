# Contributing

Thanks for helping improve Tenant Evidence Kit.

The project intentionally favors a small, auditable core over feature accumulation. A contribution should make private multi-tenant evidence workflows safer, clearer, or easier to integrate without turning the toolkit into a domain-specific application.

## Before opening a pull request

1. Check existing issues for related work.
2. For behavior or API changes, open an issue first so scope can be discussed.
3. Keep examples synthetic. Never commit real customer, patient, employee, or production evidence data.
4. Run:

```bash
npm install
npm run check
```

## Pull request expectations

A focused pull request should include:

- a clear problem statement;
- tests for behavioral changes;
- documentation when public API or security behavior changes;
- no service-role keys, tokens, credentials, private URLs, or production identifiers.

## Scope principles

Good fits include:

- tenant-isolation improvements;
- Storage/RLS hardening;
- consistency and cleanup behavior;
- typed API improvements;
- integration tests;
- provider-neutral extension points that preserve the small core.

Changes that introduce business-specific concepts should normally live in the consuming application instead.

## Security changes

For vulnerabilities, follow [SECURITY.md](SECURITY.md) rather than opening a public exploit report.
