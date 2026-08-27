# Changelog

All notable changes to Tenant Evidence Kit will be documented here.

## 0.2.0 — Unreleased

Audit-hardening release based on the independent review dated 2026-08-26.

### Fixed

- Fixed Node-native ESM package imports by emitting explicit `.js` specifiers and added an install-from-tarball smoke test.
- Added metadata reconciliation before object compensation so an ambiguous insert response does not immediately delete a possibly valid object.
- Added an optional trusted server-side compensation client for cleanup when an ordinary authenticated member cannot delete Storage objects.
- Bound new evidence metadata to the tenant UUID in the first Storage path segment.
- Bounded signed URL lifetimes to 900 seconds and validated bucket, table, ID, path, kind, and provider response contracts.

### Added

- Added stable error codes, retryability, cleanup-attempt, and reconciliation state to `TenantEvidenceError`.
- Added local pgTAP Storage policy coverage and an opt-in local Supabase integration suite for same-tenant and cross-tenant Storage flows, signed URLs, and expiry.
- Added an executable package-based example and API, consistency, migration, release, testing, and threat-model documentation.

### Changed

- Pinned CI and release workflows to Node.js 22.12.0 and npm 10.9.2.
- Added `0003_audit_hardening.sql` for existing installations.

## Unreleased

## 0.1.3 — 2026-08-25

Authorization hardening release based on external review of the reference Supabase security model.

### Changed

- Added role-based, operation-specific authorization for evidence metadata and Storage objects.
- Restricted evidence deletion to owners and admins while preserving read and creation access for active members.
- Made evidence metadata explicitly append-only and documented the RLS execution boundary, including `service_role`, table-owner, and `BYPASSRLS` behavior.
- Added `0002_authorization_hardening.sql` so existing installations can apply the hardened policies without rebuilding the schema.

### Added

- Added local Supabase/pgTAP authorization tests for privileged deletion, ordinary-member denial, same-tenant permitted flows, cross-tenant isolation, and blocked updates.
- Added database authorization coverage to CI with `supabase test db`.

## 0.1.2 — 2026-08-25

Maintenance release focused on test coverage and runtime/tooling alignment.

### Changed

- Raised the minimum supported Node.js version to 22.12 to match current Supabase JS and tooling support.
- Added a committed npm lockfile for reproducible dependency resolution.

### Added

- Added unit coverage for the upload flow, compensated cleanup, cleanup failures, and signed URL TTL validation.

## 0.1.1 — 2026-08-24

Maintenance release focused on package distribution and release security.

### Changed

- Updated package metadata with the canonical GitHub repository, homepage, issues URL, and public publish configuration.
- Updated the README to install directly from the published npm package.
- Added GitHub Actions Trusted Publishing workflow using npm OIDC instead of a long-lived npm token.
- Added release-tag validation so a GitHub release can publish only when its tag matches the package version.
- Kept the public API and reference Supabase schema unchanged from 0.1.0.

## 0.1.0 — 2026-08-24

Initial public release.

### Added

- TypeScript API for private evidence upload, listing, and signed access.
- Tenant/subject/object path convention.
- Filename sanitization and path tests.
- Typed errors with cleanup-failure visibility.
- Compensating cleanup when metadata registration fails after upload.
- Reference Supabase tenant, membership, evidence, RLS, and private Storage schema.
- Authenticated tenant bootstrap RPC.
- Security and contribution documentation.
