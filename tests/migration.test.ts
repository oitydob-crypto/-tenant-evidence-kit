import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/0001_tenant_evidence.sql", import.meta.url),
  "utf8",
);

describe("reference migration authorization", () => {
  it("keeps membership roles closed and denies unknown permissions", () => {
    expect(migration).toContain("check (role in ('owner', 'admin', 'member'))");
    expect(migration).toMatch(/else false\s+end/);
  });

  it("requires explicit permissions for every evidence and object operation", () => {
    for (const permission of [
      "evidence.read",
      "evidence.create",
      "evidence.delete",
    ]) {
      expect(migration).toContain(`'${permission}'`);
    }

    expect(migration).toContain(
      "can_access_object(name, 'evidence.create')",
    );
    expect(migration).toContain("can_access_object(name, 'evidence.read')");
    expect(migration).toContain("can_access_object(name, 'evidence.delete')");
    expect(migration).toContain(
      "when 'evidence.create' then membership.role in ('owner', 'admin')",
    );
    expect(migration).toContain(
      "when 'evidence.delete' then membership.role in ('owner', 'admin')",
    );
  });

  it("makes evidence metadata explicitly immutable", () => {
    expect(migration).toContain(
      "revoke update on public.tek_evidence from anon, authenticated",
    );
    expect(migration).not.toMatch(
      /create policy [\s\S]*?on public\.tek_evidence\s+for update/i,
    );
  });
});
