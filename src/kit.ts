import type { SupabaseClient } from "@supabase/supabase-js";

import {
  TenantEvidenceError,
  type TenantEvidenceStage,
} from "./errors.js";
import {
  buildEvidencePath,
  normalizeObjectId,
  normalizePathSegment,
  normalizeTenantId,
  validateEvidenceFilePath,
} from "./path.js";
import type {
  EvidenceKind,
  EvidenceRecord,
  ListEvidenceInput,
  SignedEvidenceUrlInput,
  TenantEvidenceKitOptions,
  UploadEvidenceInput,
} from "./types.js";

const DEFAULT_BUCKET = "tenant-evidence-private";
const DEFAULT_TABLE = "tek_evidence";
const DEFAULT_SIGNED_URL_TTL_SECONDS = 300;
const MAX_SIGNED_URL_TTL_SECONDS = 900;
const EVIDENCE_SELECT =
  "id,tenant_id,subject_id,kind,file_path,recorded_at,captured_at,note,metadata";

type EvidenceRow = {
  id: string;
  tenant_id: string;
  subject_id: string;
  kind: EvidenceKind;
  file_path: string;
  recorded_at: string;
  captured_at: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
};

type ReconciliationResult =
  | { state: "present"; row: EvidenceRow }
  | { state: "not-found" }
  | { state: "unknown"; error: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  return "unknown error";
}

function invalidResponse(message: string, stage: TenantEvidenceStage): never {
  throw new TenantEvidenceError(message, {
    stage,
    code: "INVALID_RESPONSE",
    retryable: false,
  });
}

function requireString(
  value: unknown,
  field: string,
  stage: TenantEvidenceStage,
): string {
  if (typeof value !== "string" || !value) {
    invalidResponse(`Supabase returned an invalid ${field}`, stage);
  }
  return value;
}

function parseEvidenceRow(value: unknown, stage: TenantEvidenceStage): EvidenceRow {
  if (!isRecord(value)) {
    invalidResponse("Supabase returned an invalid evidence row", stage);
  }

  const id = requireString(value.id, "evidence id", stage);
  const tenantId = requireString(value.tenant_id, "tenant id", stage);
  const subjectId = requireString(value.subject_id, "subject id", stage);
  const kind = value.kind;
  const filePath = requireString(value.file_path, "file path", stage);
  const recordedAt = requireString(value.recorded_at, "recorded timestamp", stage);
  const capturedAt = value.captured_at;
  const note = value.note;
  const metadata = value.metadata;

  if (kind !== "photo" && kind !== "document" && kind !== "other") {
    invalidResponse(`Supabase returned an unknown evidence kind: ${String(kind)}`, stage);
  }
  if (capturedAt !== null && typeof capturedAt !== "string") {
    invalidResponse("Supabase returned an invalid captured timestamp", stage);
  }
  if (note !== null && typeof note !== "string") {
    invalidResponse("Supabase returned an invalid evidence note", stage);
  }
  if (metadata !== null && !isRecord(metadata)) {
    invalidResponse("Supabase returned invalid evidence metadata", stage);
  }

  try {
    validateEvidenceFilePath(filePath);
  } catch (error) {
    invalidResponse(`Supabase returned an invalid evidence path: ${errorMessage(error)}`, stage);
  }

  return {
    id,
    tenant_id: tenantId,
    subject_id: subjectId,
    kind,
    file_path: filePath,
    recorded_at: recordedAt,
    captured_at: capturedAt,
    note,
    metadata,
  };
}

function toEvidenceRecord(row: EvidenceRow): EvidenceRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    subjectId: row.subject_id,
    kind: row.kind,
    filePath: row.file_path,
    recordedAt: row.recorded_at,
    capturedAt: row.captured_at ?? undefined,
    note: row.note ?? undefined,
    metadata: row.metadata ?? undefined,
  };
}

function validationError(message: string, cause?: unknown): TenantEvidenceError {
  return new TenantEvidenceError(message, {
    stage: "validation",
    code: "INVALID_INPUT",
    retryable: false,
    cause,
  });
}

function validateBucketName(bucket: string): string {
  const normalized = bucket.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(normalized)) {
    throw validationError(
      "bucket must be a single Storage bucket identifier without path separators",
    );
  }
  return normalized;
}

function validateTableName(table: string): string {
  const normalized = table.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(normalized)) {
    throw validationError(
      "table must be a simple PostgREST table identifier or schema-qualified identifier",
    );
  }
  return normalized;
}

function validateKind(value: unknown): EvidenceKind {
  if (value === "photo" || value === "document" || value === "other") {
    return value;
  }
  throw validationError("kind must be photo, document, or other");
}

function normalizeUploadInput(input: UploadEvidenceInput): {
  tenantId: string;
  subjectId: string;
  evidenceId: string;
  path: string;
  kind: EvidenceKind;
} {
  try {
    const tenantId = normalizeTenantId(input.tenantId);
    const subjectId = normalizePathSegment(input.subjectId, "subjectId");
    const evidenceId = normalizeObjectId(input.objectId ?? crypto.randomUUID());
    const path = buildEvidencePath({
      tenantId,
      subjectId,
      objectId: evidenceId,
      fileName: input.fileName,
    });

    return {
      tenantId,
      subjectId,
      evidenceId,
      path,
      kind: validateKind(input.kind ?? "photo"),
    };
  } catch (error) {
    if (error instanceof TenantEvidenceError) {
      throw error;
    }
    throw validationError(`Invalid evidence input: ${errorMessage(error)}`, error);
  }
}

async function reconcileMetadata(
  client: SupabaseClient,
  table: string,
  evidenceId: string,
  path: string,
  tenantId: string,
  subjectId: string,
): Promise<ReconciliationResult> {
  try {
    const { data, error } = await client
      .from(table)
      .select(EVIDENCE_SELECT)
      .eq("id", evidenceId)
      .maybeSingle();

    if (error) {
      return { state: "unknown", error };
    }
    if (data === null || data === undefined) {
      return { state: "not-found" };
    }

    const row = parseEvidenceRow(data, "reconciliation");
    if (
      row.id !== evidenceId ||
      row.tenant_id !== tenantId ||
      row.subject_id !== subjectId ||
      row.file_path !== path
    ) {
      return {
        state: "unknown",
        error: new Error("reconciled metadata does not match the uploaded object"),
      };
    }

    return { state: "present", row };
  } catch (error) {
    return { state: "unknown", error };
  }
}

function throwReconciliationError(
  originalError: unknown,
  reconciliationError: unknown,
): never {
  throw new TenantEvidenceError(
    "Evidence metadata state is ambiguous; retry reconciliation before cleanup",
    {
      stage: "reconciliation",
      code: "RECONCILIATION_FAILED",
      retryable: true,
      cause: originalError,
      reconciliationError,
      reconciliation: "unknown",
    },
  );
}

export function createTenantEvidenceKit(
  client: SupabaseClient,
  options: TenantEvidenceKitOptions = {},
) {
  const bucket = validateBucketName(options.bucket ?? DEFAULT_BUCKET);
  const table = validateTableName(options.table ?? DEFAULT_TABLE);
  const compensationClient = options.compensationClient ?? client;

  async function uploadEvidence(
    input: UploadEvidenceInput,
  ): Promise<EvidenceRecord> {
    const { tenantId, subjectId, evidenceId, path, kind } = normalizeUploadInput(input);

    const { error: uploadError } = await client.storage
      .from(bucket)
      .upload(path, input.body, {
        contentType: input.contentType,
        upsert: false,
      });

    if (uploadError) {
      throw new TenantEvidenceError(
        `Evidence upload failed: ${errorMessage(uploadError)}`,
        {
          stage: "upload",
          code: "UPLOAD_FAILED",
          retryable: true,
          cause: uploadError,
        },
      );
    }

    const { data, error: metadataError } = await client
      .from(table)
      .insert({
        id: evidenceId,
        tenant_id: tenantId,
        subject_id: subjectId,
        kind,
        file_path: path,
        captured_at: input.capturedAt ?? null,
        note: input.note ?? null,
        metadata: input.metadata ?? {},
      })
      .select(EVIDENCE_SELECT)
      .single();

    if (!metadataError && data) {
      return toEvidenceRecord(parseEvidenceRow(data, "metadata"));
    }

    const originalError = metadataError ?? new Error("no row returned");
    const reconciliation = await reconcileMetadata(
      compensationClient,
      table,
      evidenceId,
      path,
      tenantId,
      subjectId,
    );

    if (reconciliation.state === "present") {
      return toEvidenceRecord(reconciliation.row);
    }
    if (reconciliation.state === "unknown") {
      throwReconciliationError(originalError, reconciliation.error);
    }

    const { error: cleanupError } = await compensationClient.storage
      .from(bucket)
      .remove([path]);

    if (cleanupError) {
      throw new TenantEvidenceError(
        `Evidence cleanup failed after metadata registration failure: ${errorMessage(cleanupError)}`,
        {
          stage: "cleanup",
          code: "CLEANUP_FAILED",
          retryable: true,
          cause: originalError,
          cleanupError,
          reconciliation: "not-found",
          cleanupAttempted: true,
        },
      );
    }

    throw new TenantEvidenceError(
      `Evidence metadata registration failed: ${errorMessage(originalError)}`,
      {
        stage: "metadata",
        code: "METADATA_FAILED",
        retryable: true,
        cause: originalError,
        reconciliation: "not-found",
        cleanupAttempted: true,
      },
    );
  }

  async function listEvidence(
    input: ListEvidenceInput,
  ): Promise<EvidenceRecord[]> {
    let tenantId: string;
    let subjectId: string;
    try {
      tenantId = normalizeTenantId(input.tenantId);
      subjectId = normalizePathSegment(input.subjectId, "subjectId");
    } catch (error) {
      if (error instanceof TenantEvidenceError) {
        throw error;
      }
      throw validationError(`Invalid evidence list input: ${errorMessage(error)}`, error);
    }

    const { data, error } = await client
      .from(table)
      .select(EVIDENCE_SELECT)
      .eq("tenant_id", tenantId)
      .eq("subject_id", subjectId)
      .order("recorded_at", { ascending: false });

    if (error) {
      throw new TenantEvidenceError(`Evidence list failed: ${errorMessage(error)}`, {
        stage: "list",
        code: "LIST_FAILED",
        retryable: true,
        cause: error,
      });
    }
    if (!Array.isArray(data)) {
      invalidResponse("Supabase returned an invalid evidence list", "list");
    }

    return data.map((row) => toEvidenceRecord(parseEvidenceRow(row, "list")));
  }

  async function createSignedEvidenceUrl(
    input: SignedEvidenceUrlInput,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    let filePath: string;
    try {
      filePath = validateEvidenceFilePath(input.filePath);
    } catch (error) {
      throw validationError(`Invalid evidence file path: ${errorMessage(error)}`, error);
    }

    const expiresInSeconds =
      input.expiresInSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
    if (
      !Number.isInteger(expiresInSeconds) ||
      expiresInSeconds <= 0 ||
      expiresInSeconds > MAX_SIGNED_URL_TTL_SECONDS
    ) {
      throw validationError(
        `expiresInSeconds must be an integer between 1 and ${MAX_SIGNED_URL_TTL_SECONDS}`,
      );
    }

    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresInSeconds);

    if (error || !isRecord(data) || typeof data.signedUrl !== "string") {
      throw new TenantEvidenceError(
        `Signed URL creation failed: ${errorMessage(error ?? new Error("no URL returned"))}`,
        {
          stage: "signed-url",
          code: "SIGNED_URL_FAILED",
          retryable: true,
          cause: error,
        },
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

