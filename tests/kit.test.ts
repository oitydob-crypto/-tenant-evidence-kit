import { describe, expect, it, vi } from "vitest";

import {
  TenantEvidenceError,
  createTenantEvidenceKit,
} from "../src/index.js";

const tenantId = "10000000-0000-4000-8000-000000000001";
const objectId = "20000000-0000-4000-8000-000000000001";
const filePath = `${tenantId}/subject-id/${objectId}-photo.jpg`;

type InsertResult = { data: unknown; error: unknown };

function evidenceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: objectId,
    tenant_id: tenantId,
    subject_id: "subject-id",
    kind: "photo",
    file_path: filePath,
    recorded_at: "2026-08-25T12:00:00.000Z",
    captured_at: null,
    note: null,
    metadata: {},
    ...overrides,
  };
}

function createClientDouble(options: {
  insertResult?: InsertResult;
  reconciliationResult?: { data: unknown; error: unknown };
  cleanupError?: { message: string } | null;
  signedUrlResult?: { data: unknown; error: unknown };
  listResult?: { data: unknown; error: unknown };
}) {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: options.cleanupError ?? null });
  const createSignedUrl = vi.fn().mockResolvedValue(
    options.signedUrlResult ?? {
      data: { signedUrl: "https://example.test/signed-evidence" },
      error: null,
    },
  );
  const single = vi.fn().mockResolvedValue(
    options.insertResult ?? {
      data: evidenceRow(),
      error: null,
    },
  );
  const maybeSingle = vi.fn().mockResolvedValue(
    options.reconciliationResult ?? { data: null, error: null },
  );
  const order = vi.fn().mockResolvedValue(
    options.listResult ?? { data: [], error: null },
  );
  const secondEq = vi.fn().mockReturnValue({ order });
  const firstEq = vi.fn().mockReturnValue({
    eq: secondEq,
    maybeSingle,
  });
  const select = vi.fn().mockReturnValue({
    single,
    eq: firstEq,
  });
  const insert = vi.fn().mockReturnValue({ select });

  return {
    client: {
      storage: {
        from: vi.fn().mockReturnValue({ upload, remove, createSignedUrl }),
      },
      from: vi.fn().mockReturnValue({ insert, select }),
    },
    calls: { upload, remove, createSignedUrl, insert, maybeSingle },
  };
}

describe("createTenantEvidenceKit", () => {
  const uploadInput = {
    tenantId,
    subjectId: "subject-id",
    objectId,
    body: new Uint8Array([1, 2, 3]),
    fileName: "photo.jpg",
    contentType: "image/jpeg",
  };

  it("uploads a private object and records its metadata", async () => {
    const { client, calls } = createClientDouble({});
    const evidence = createTenantEvidenceKit(client as never);

    const record = await evidence.uploadEvidence(uploadInput);

    expect(calls.upload).toHaveBeenCalledWith(
      filePath,
      uploadInput.body,
      { contentType: "image/jpeg", upsert: false },
    );
    expect(calls.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: objectId,
        tenant_id: tenantId,
        subject_id: "subject-id",
        file_path: filePath,
      }),
    );
    expect(record).toMatchObject({
      id: objectId,
      filePath,
    });
  });

  it("reconciles an ambiguous metadata response before compensating", async () => {
    const { client, calls } = createClientDouble({
      insertResult: { data: null, error: { message: "connection reset" } },
      reconciliationResult: { data: evidenceRow(), error: null },
    });
    const evidence = createTenantEvidenceKit(client as never);

    await expect(evidence.uploadEvidence(uploadInput)).resolves.toMatchObject({
      id: objectId,
      filePath,
    });
    expect(calls.maybeSingle).toHaveBeenCalledWith();
    expect(calls.remove).not.toHaveBeenCalled();
  });

  it("uses a trusted compensation client when metadata is absent", async () => {
    const caller = createClientDouble({
      insertResult: { data: null, error: { message: "RLS rejected insert" } },
    });
    const compensation = createClientDouble({});
    const evidence = createTenantEvidenceKit(caller.client as never, {
      compensationClient: compensation.client as never,
    });

    await expect(evidence.uploadEvidence(uploadInput)).rejects.toMatchObject({
      name: "TenantEvidenceError",
      stage: "metadata",
      code: "METADATA_FAILED",
      reconciliation: "not-found",
      cleanupAttempted: true,
    } satisfies Partial<TenantEvidenceError>);
    expect(caller.calls.remove).not.toHaveBeenCalled();
    expect(compensation.calls.remove).toHaveBeenCalledWith([filePath]);
  });

  it("exposes a cleanup failure after metadata registration fails", async () => {
    const caller = createClientDouble({
      insertResult: { data: null, error: { message: "RLS rejected insert" } },
    });
    const compensation = createClientDouble({
      cleanupError: { message: "Storage delete failed" },
    });
    const evidence = createTenantEvidenceKit(caller.client as never, {
      compensationClient: compensation.client as never,
    });

    await expect(evidence.uploadEvidence(uploadInput)).rejects.toMatchObject({
      name: "TenantEvidenceError",
      stage: "cleanup",
      code: "CLEANUP_FAILED",
      cleanupError: { message: "Storage delete failed" },
    } satisfies Partial<TenantEvidenceError>);
  });

  it("does not delete an object when reconciliation is still ambiguous", async () => {
    const { client, calls } = createClientDouble({
      insertResult: { data: null, error: { message: "connection reset" } },
      reconciliationResult: {
        data: null,
        error: { message: "reconciliation unavailable" },
      },
    });
    const evidence = createTenantEvidenceKit(client as never);

    await expect(evidence.uploadEvidence(uploadInput)).rejects.toMatchObject({
      name: "TenantEvidenceError",
      stage: "reconciliation",
      code: "RECONCILIATION_FAILED",
      reconciliation: "unknown",
    } satisfies Partial<TenantEvidenceError>);
    expect(calls.remove).not.toHaveBeenCalled();
  });

  it("lists and maps validated evidence rows", async () => {
    const { client } = createClientDouble({
      listResult: { data: [evidenceRow()], error: null },
    });
    const evidence = createTenantEvidenceKit(client as never);

    await expect(
      evidence.listEvidence({ tenantId, subjectId: "subject-id" }),
    ).resolves.toMatchObject([{ id: objectId, filePath }]);
  });

  it("rejects an unknown evidence kind instead of silently changing it", async () => {
    const { client } = createClientDouble({
      listResult: {
        data: [evidenceRow({ kind: "invoice" })],
        error: null,
      },
    });
    const evidence = createTenantEvidenceKit(client as never);

    await expect(
      evidence.listEvidence({ tenantId, subjectId: "subject-id" }),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      stage: "list",
    } satisfies Partial<TenantEvidenceError>);
  });

  it("creates a signed URL within the bounded lifetime", async () => {
    const { client, calls } = createClientDouble({});
    const evidence = createTenantEvidenceKit(client as never);

    await expect(
      evidence.createSignedEvidenceUrl({ filePath, expiresInSeconds: 120 }),
    ).resolves.toEqual({
      url: "https://example.test/signed-evidence",
      expiresInSeconds: 120,
    });
    expect(calls.createSignedUrl).toHaveBeenCalledWith(filePath, 120);
  });

  it("rejects unsafe paths and excessive signed URL lifetimes before Storage", async () => {
    const { client, calls } = createClientDouble({});
    const evidence = createTenantEvidenceKit(client as never);

    await expect(
      evidence.createSignedEvidenceUrl({
        filePath: "../other/file.jpg",
        expiresInSeconds: 120,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", stage: "validation" });
    await expect(
      evidence.createSignedEvidenceUrl({ filePath, expiresInSeconds: 901 }),
    ).rejects.toThrow("between 1 and 900");
    expect(calls.createSignedUrl).not.toHaveBeenCalled();
  });

  it("validates bucket and table identifiers at construction", () => {
    const { client } = createClientDouble({});

    expect(() =>
      createTenantEvidenceKit(client as never, { bucket: "private/bucket" }),
    ).toThrow("bucket must be a single Storage bucket identifier");
    expect(() =>
      createTenantEvidenceKit(client as never, { table: "tek evidence" }),
    ).toThrow("table must be a simple PostgREST table identifier");
  });
});

