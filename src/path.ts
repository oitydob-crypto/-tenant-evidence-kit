const UNSAFE_FILE_NAME = /[^a-zA-Z0-9._-]+/g;

export function sanitizeFileName(fileName: string): string {
  const sanitized = fileName
    .trim()
    .replace(UNSAFE_FILE_NAME, "_")
    .replace(/^_+|_+$/g, "");

  return sanitized || "evidence";
}

export interface EvidencePathInput {
  tenantId: string;
  subjectId: string;
  objectId: string;
  fileName: string;
}

export function buildEvidencePath(input: EvidencePathInput): string {
  if (!input.tenantId.trim()) throw new Error("tenantId is required");
  if (!input.subjectId.trim()) throw new Error("subjectId is required");
  if (!input.objectId.trim()) throw new Error("objectId is required");

  return [
    input.tenantId,
    input.subjectId,
    `${input.objectId}-${sanitizeFileName(input.fileName)}`,
  ].join("/");
}
