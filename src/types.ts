export type EvidenceKind = "photo" | "document" | "other";

export interface EvidenceRecord {
  id: string;
  tenantId: string;
  subjectId: string;
  kind: EvidenceKind;
  filePath: string;
  recordedAt: string;
  capturedAt?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface UploadEvidenceInput {
  tenantId: string;
  subjectId: string;
  body: Blob | ArrayBuffer | Uint8Array;
  fileName: string;
  contentType?: string;
  kind?: EvidenceKind;
  capturedAt?: string;
  note?: string;
  metadata?: Record<string, unknown>;
  objectId?: string;
}

export interface ListEvidenceInput {
  tenantId: string;
  subjectId: string;
}

export interface SignedEvidenceUrlInput {
  filePath: string;
  expiresInSeconds?: number;
}

export interface TenantEvidenceKitOptions {
  bucket?: string;
  table?: string;
}
