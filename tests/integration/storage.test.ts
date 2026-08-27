import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  TenantEvidenceError,
  createTenantEvidenceKit,
} from "../../src/index.js";

const integrationDescribe =
  process.env.TEK_STORAGE_INTEGRATION === "1" ? describe : describe.skip;

type IntegrationState = {
  admin: SupabaseClient;
  ownerA: SupabaseClient;
  ownerB: SupabaseClient;
  tenantA: string;
  tenantB: string;
  subjectId: string;
  record: { id: string; filePath: string };
};

async function requireData<T>(
  result: { data: T; error: { message: string } | null },
  label: string,
): Promise<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`${label}: ${result.error?.message ?? "no data"}`);
  }
  return result.data;
}

integrationDescribe("local Supabase Storage integration", () => {
  let state: IntegrationState;
  let userA: string;
  let userB: string;
  const password = `TEK-${randomUUID()}-Password!`;

  beforeAll(async () => {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceRoleKey) {
      throw new Error(
        "TEK_STORAGE_INTEGRATION requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY",
      );
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = () =>
      createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

    const emailA = `tek-owner-a-${randomUUID()}@example.test`;
    const emailB = `tek-owner-b-${randomUUID()}@example.test`;
    const createdA = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    const createdB = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (createdA.error || !createdA.data.user) {
      throw new Error(`create user A: ${createdA.error?.message ?? "no user"}`);
    }
    if (createdB.error || !createdB.data.user) {
      throw new Error(`create user B: ${createdB.error?.message ?? "no user"}`);
    }
    userA = createdA.data.user.id;
    userB = createdB.data.user.id;

    const ownerA = anon();
    const ownerB = anon();
    const signedInA = await ownerA.auth.signInWithPassword({ email: emailA, password });
    const signedInB = await ownerB.auth.signInWithPassword({ email: emailB, password });
    if (signedInA.error || !signedInA.data.session) {
      throw new Error(`sign in user A: ${signedInA.error?.message ?? "no session"}`);
    }
    if (signedInB.error || !signedInB.data.session) {
      throw new Error(`sign in user B: ${signedInB.error?.message ?? "no session"}`);
    }

    const tenantA = await requireData(
      await ownerA.rpc("tek_create_tenant", { tenant_name: `TEK A ${randomUUID()}` }),
      "create tenant A",
    );
    const tenantB = await requireData(
      await ownerB.rpc("tek_create_tenant", { tenant_name: `TEK B ${randomUUID()}` }),
      "create tenant B",
    );
    const subjectId = `integration-${randomUUID()}`;
    const kitA = createTenantEvidenceKit(ownerA);
    const record = await kitA.uploadEvidence({
      tenantId: tenantA,
      subjectId,
      objectId: randomUUID(),
      body: new Blob(["synthetic TEK integration evidence"]),
      fileName: "integration.txt",
      contentType: "text/plain",
      kind: "document",
    });

    state = {
      admin,
      ownerA,
      ownerB,
      tenantA,
      tenantB,
      subjectId,
      record,
    };
  }, 60_000);

  afterAll(async () => {
    if (!state) return;
    await state.admin.storage
      .from("tenant-evidence-private")
      .remove([state.record.filePath]);
    await state.admin.from("tek_evidence").delete().eq("id", state.record.id);
    if (userA) await state.admin.auth.admin.deleteUser(userA);
    if (userB) await state.admin.auth.admin.deleteUser(userB);
  });

  it("allows same-tenant list, download, and signed access", async () => {
    const kitA = createTenantEvidenceKit(state.ownerA);
    const records = await kitA.listEvidence({
      tenantId: state.tenantA,
      subjectId: state.subjectId,
    });
    expect(records).toHaveLength(1);

    const listed = await state.ownerA.storage
      .from("tenant-evidence-private")
      .list(`${state.tenantA}/${state.subjectId}`);
    expect(listed.error).toBeNull();
    expect(listed.data?.some((object) => object.name.endsWith("-integration.txt"))).toBe(true);

    const downloaded = await state.ownerA.storage
      .from("tenant-evidence-private")
      .download(state.record.filePath);
    expect(downloaded.error).toBeNull();
    expect(await downloaded.data?.text()).toContain("synthetic TEK");

    const signed = await kitA.createSignedEvidenceUrl({
      filePath: state.record.filePath,
      expiresInSeconds: 2,
    });
    const immediate = await fetch(signed.url);
    expect(immediate.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const expired = await fetch(signed.url);
    expect(expired.ok).toBe(false);
  }, 20_000);

  it("denies cross-tenant list, download, signed access, and delete", async () => {
    const kitB = createTenantEvidenceKit(state.ownerB);
    const records = await kitB.listEvidence({
      tenantId: state.tenantA,
      subjectId: state.subjectId,
    });
    expect(records).toEqual([]);

    const listed = await state.ownerB.storage
      .from("tenant-evidence-private")
      .list(state.tenantA);
    if (!listed.error) expect(listed.data).toEqual([]);

    const downloaded = await state.ownerB.storage
      .from("tenant-evidence-private")
      .download(state.record.filePath);
    expect(downloaded.error).not.toBeNull();

    await expect(
      kitB.createSignedEvidenceUrl({ filePath: state.record.filePath }),
    ).rejects.toBeInstanceOf(TenantEvidenceError);

    const removed = await state.ownerB.storage
      .from("tenant-evidence-private")
      .remove([state.record.filePath]);
    expect(removed.error).toBeNull();

    const stillPresent = await state.ownerA.storage
      .from("tenant-evidence-private")
      .download(state.record.filePath);
    expect(stillPresent.error).toBeNull();
  });
});

