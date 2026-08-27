# Release checklist

The audit hardening is classified as `0.2.0`, not `v2`: the project is still
pre-1.0 and the changes remain within the same small toolkit and Supabase
reference architecture. The release adds a trusted compensation option and
strict validation, so callers relying on malformed IDs or unrestricted signed
URL TTLs must update before adopting it.

Before publishing:

1. Update `package.json`, `package-lock.json`, `README.md`, and `CHANGELOG.md`
   to the same version.
2. Run `npm run check` and the local Supabase authorization/integration suites.
3. Confirm the GitHub Actions `CI` run is green on the release commit.
4. Create a GitHub Release whose tag is exactly `v<package.json version>`.
5. Confirm the `Publish Package` workflow is green and npm shows the matching
   version before calling the release complete.

The publish workflow pins Node.js 22.12.0 and npm 10.9.2. It does not install
`npm@latest` during a release.

