# Changelog

All notable changes to Tenant Evidence Kit will be documented here.

## Unreleased

### Changed

- Added role-based, operation-specific authorization for evidence metadata and Storage objects.
- Restricted evidence creation and deletion to owners and admins, while keeping read access available to active members.
- Made evidence metadata explicitly append-only and added regression coverage and security-model documentation.
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
