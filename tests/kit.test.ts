import { describe, expect, it, vi } from "vitest";

import {
  TenantEvidenceError,
  createTenantEvidenceKit,
} from "../src/index";

type InsertResult = { data: unknown; error: unknown };

function createClientDouble(options: {
  insertResult?: InsertResult;
  uploadError?: { message: string } | null;
  cleanupError?: { message: string } | null;
  signedUrlResult?: { data: unknown; error: unknown };
}) {
  const upload = vi.fn().mockResolvedValue({ error: options.uploadError ?? null });
  const remove = vi.fn().mockResolvedValue({ error: options.cleanupError ?? null });
  const createSignedUrl = vi.fn().mockResolvedValue(
    options.signedUrlResult ?? {
      data: { signedUrl: "https://example.test/signed-evidence" },
      error: null,
    },
  );
  const single = vi.fn().mockResolvedValue(
    options.insertResult ?? {
      data: {
        id: "evidence-id",
        tenant_id: "tenant-id",
        subject_id: "subject-id",
        kind: "photo",
        file_path: "tenant-id/subject-id/evidence-id-photo.jpg",
        recorded_at: "2026-08-25T12:00:00.000Z",
        captured_at: null,
        note: null,
        metadata: {},
      },
      error: null,
    },
  );
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });

  return {
    client: {
      storage: {
        from: vi.fn().mockReturnValue({ upload, remove, createSignedUrl }),
      },
      from: vi.fn().mockReturnValue({ insert }),
    },
    calls: { upload, remove, createSignedUrl, insert },
  };
}

describe("createTenantEvidenceKit", () => {
  const uploadInput = {
    tenantId: "tenant-id",
    subjectId: "subject-id",
    objectId: "evidence-id",
    body: new Uint8Array([1, 2, 3]),
    fileName: "photo.jpg",
    contentType: "image/jpeg",
  };

  it("uploads a private object and records its metadata", async () => {
    const { client, calls } = createClientDouble({});
    const evidence = createTenantEvidenceKit(client as never);

    const record = await evidence.uploadEvidence(uploadInput);

    expect(calls.upload).toHaveBeenCalledWith(
      "tenant-id/subject-id/evidence-id-photo.jpg",
      uploadInput.body,
      { contentType: "image/jpeg", upsert: false },
    );
    expect(calls.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "evidence-id",
        tenant_id: "tenant-id",
        subject_id: "subject-id",
      }),
    );
    expect(record).toMatchObject({
      id: "evidence-id",
      filePath: "tenant-id/subject-id/evidence-id-photo.jpg",
    });
  });

  it("removes the uploaded object when metadata registration fails", async () => {
    const metadataError = { message: "RLS rejected insert" };
    const { client, calls } = createClientDouble({
      insertResult: { data: null, error: metadataError },
    });
    const evidence = createTenantEvidenceKit(client as never);

    await expect(evidence.uploadEvidence(uploadInput)).rejects.toMatchObject({
      name: "TenantEvidenceError",
      stage: "metadata",
      cause: metadataError,
    } satisfies Partial<TenantEvidenceError>);
    expect(calls.remove).toHaveBeenCalledWith([
      "tenant-id/subject-id/evidence-id-photo.jpg",
    ]);
  });

  it("exposes a cleanup failure after a metadata failure", async () => {
    const cleanupError = { message: "Storage delete failed" };
    const { client } = createClientDouble({
      insertResult: { data: null, error: { message: "RLS rejected insert" } },
      cleanupError,
    });
    const evidence = createTenantEvidenceKit(client as never);

    await expect(evidence.uploadEvidence(uploadInput)).rejects.toMatchObject({
      name: "TenantEvidenceError",
      stage: "cleanup",
      cleanupError,
    } satisfies Partial<TenantEvidenceError>);
  });

  it("rejects an invalid signed URL lifetime before requesting Storage", async () => {
    const { client, calls } = createClientDouble({});
    const evidence = createTenantEvidenceKit(client as never);

    await expect(
      evidence.createSignedEvidenceUrl({
        filePath: "tenant-id/subject-id/evidence-id-photo.jpg",
        expiresInSeconds: 0,
      }),
    ).rejects.toThrow("expiresInSeconds must be a positive integer");
    expect(calls.createSignedUrl).not.toHaveBeenCalled();
  });
});
