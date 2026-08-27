const UNSAFE_FILE_NAME = /[^a-zA-Z0-9._-]+/g;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export function sanitizeFileName(fileName: string): string {
  const sanitized = fileName
    .trim()
    .replace(UNSAFE_FILE_NAME, "_")
    .replace(/^_+|_+$/g, "");

  return sanitized || "evidence";
}

export function normalizeTenantId(tenantId: string): string {
  const normalized = tenantId.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error("tenantId must be a UUID");
  }

  return normalized;
}

export function normalizeObjectId(objectId: string): string {
  const normalized = objectId.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error("objectId must be a UUID");
  }

  return normalized;
}

export function normalizePathSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  if (normalized === "." || normalized === ".." || !SAFE_PATH_SEGMENT.test(normalized)) {
    throw new Error(`${label} must be a safe path segment`);
  }

  return normalized;
}

export interface EvidencePathInput {
  tenantId: string;
  subjectId: string;
  objectId: string;
  fileName: string;
}

export function buildEvidencePath(input: EvidencePathInput): string {
  const tenantId = normalizeTenantId(input.tenantId);
  const subjectId = normalizePathSegment(input.subjectId, "subjectId");
  const objectId = normalizeObjectId(input.objectId);

  return [
    tenantId,
    subjectId,
    `${objectId}-${sanitizeFileName(input.fileName)}`,
  ].join("/");
}

export function validateEvidenceFilePath(filePath: string): string {
  const normalized = filePath.trim();
  const segments = normalized.split("/");

  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    throw new Error(
      "filePath must contain tenant, subject, and object-file path segments",
    );
  }

  const tenantId = normalizeTenantId(segments[0]);
  const subjectId = normalizePathSegment(segments[1], "filePath subjectId");
  const objectAndFileName = segments[2];
  const objectId = objectAndFileName.slice(0, 36);
  const fileName = objectAndFileName.slice(37);

  if (objectAndFileName[36] !== "-" || !fileName) {
    throw new Error("filePath must contain a UUID object id and file name");
  }

  const normalizedObjectId = normalizeObjectId(objectId);
  if (sanitizeFileName(fileName) !== fileName) {
    throw new Error("filePath contains an unsafe file name");
  }

  return `${tenantId}/${subjectId}/${normalizedObjectId}-${fileName}`;
}

