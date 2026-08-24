import type { SupabaseClient } from "@supabase/supabase-js";

import { TenantEvidenceError } from "./errors";
import { buildEvidencePath } from "./path";
import type {
  EvidenceKind,
  EvidenceRecord,
  ListEvidenceInput,
  SignedEvidenceUrlInput,
  TenantEvidenceKitOptions,
  UploadEvidenceInput,
} from "./types";

const DEFAULT_BUCKET = "tenant-evidence-private";
const DEFAULT_TABLE = "tek_evidence";
const DEFAULT_SIGNED_URL_TTL_SECONDS = 300;

type EvidenceRow = {
  id: string;
  tenant_id: string;
  subject_id: string;
  kind: string;
  file_path: string;
  recorded_at: string;
  captured_at: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
};

function toEvidenceKind(value: string): EvidenceKind {
  return value === "photo" || value === "document" ? value : "other";
}

function toEvidenceRecord(row: EvidenceRow): EvidenceRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    subjectId: row.subject_id,
    kind: toEvidenceKind(row.kind),
    filePath: row.file_path,
    recordedAt: row.recorded_at,
    capturedAt: row.captured_at ?? undefined,
    note: row.note ?? undefined,
    metadata: row.metadata ?? undefined,
  };
}

export function createTenantEvidenceKit(
  client: SupabaseClient,
  options: TenantEvidenceKitOptions = {},
) {
  const bucket = options.bucket ?? DEFAULT_BUCKET;
  const table = options.table ?? DEFAULT_TABLE;

  async function uploadEvidence(
    input: UploadEvidenceInput,
  ): Promise<EvidenceRecord> {
    const evidenceId = input.objectId ?? crypto.randomUUID();
    const path = buildEvidencePath({
      tenantId: input.tenantId,
      subjectId: input.subjectId,
      objectId: evidenceId,
      fileName: input.fileName,
    });

    const { error: uploadError } = await client.storage
      .from(bucket)
      .upload(path, input.body, {
        contentType: input.contentType,
        upsert: false,
      });

    if (uploadError) {
      throw new TenantEvidenceError(
        `Evidence upload failed: ${uploadError.message}`,
        { stage: "upload", cause: uploadError },
      );
    }

    const { data, error: metadataError } = await client
      .from(table)
      .insert({
        id: evidenceId,
        tenant_id: input.tenantId,
        subject_id: input.subjectId,
        kind: input.kind ?? "photo",
        file_path: path,
        captured_at: input.capturedAt ?? null,
        note: input.note ?? null,
        metadata: input.metadata ?? {},
      })
      .select(
        "id,tenant_id,subject_id,kind,file_path,recorded_at,captured_at,note,metadata",
      )
      .single();

    if (metadataError || !data) {
      const { error: cleanupError } = await client.storage
        .from(bucket)
        .remove([path]);

      throw new TenantEvidenceError(
        `Evidence metadata registration failed: ${metadataError?.message ?? "no row returned"}`,
        {
          stage: cleanupError ? "cleanup" : "metadata",
          cause: metadataError,
          cleanupError: cleanupError ?? undefined,
        },
      );
    }

    return toEvidenceRecord(data as EvidenceRow);
  }

  async function listEvidence(
    input: ListEvidenceInput,
  ): Promise<EvidenceRecord[]> {
    const { data, error } = await client
      .from(table)
      .select(
        "id,tenant_id,subject_id,kind,file_path,recorded_at,captured_at,note,metadata",
      )
      .eq("tenant_id", input.tenantId)
      .eq("subject_id", input.subjectId)
      .order("recorded_at", { ascending: false });

    if (error) {
      throw new TenantEvidenceError(
        `Evidence list failed: ${error.message}`,
        { stage: "list", cause: error },
      );
    }

    return ((data ?? []) as EvidenceRow[]).map(toEvidenceRecord);
  }

  async function createSignedEvidenceUrl(
    input: SignedEvidenceUrlInput,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const expiresInSeconds =
      input.expiresInSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;

    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
      throw new Error("expiresInSeconds must be a positive integer");
    }

    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(input.filePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new TenantEvidenceError(
        `Signed URL creation failed: ${error?.message ?? "no URL returned"}`,
        { stage: "signed-url", cause: error },
      );
    }

    return { url: data.signedUrl, expiresInSeconds };
  }

  return {
    bucket,
    table,
    uploadEvidence,
    listEvidence,
    createSignedEvidenceUrl,
  };
}
