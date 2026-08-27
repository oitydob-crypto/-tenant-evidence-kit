export type TenantEvidenceStage =
  | "validation"
  | "upload"
  | "metadata"
  | "cleanup"
  | "reconciliation"
  | "list"
  | "signed-url";

export type TenantEvidenceErrorCode =
  | "INVALID_INPUT"
  | "UPLOAD_FAILED"
  | "METADATA_FAILED"
  | "CLEANUP_FAILED"
  | "RECONCILIATION_FAILED"
  | "LIST_FAILED"
  | "SIGNED_URL_FAILED"
  | "INVALID_RESPONSE";

export type TenantEvidenceReconciliationState =
  | "not-attempted"
  | "not-found"
  | "present"
  | "unknown";

const DEFAULT_ERROR_CODES: Record<
  TenantEvidenceStage,
  TenantEvidenceErrorCode
> = {
  validation: "INVALID_INPUT",
  upload: "UPLOAD_FAILED",
  metadata: "METADATA_FAILED",
  cleanup: "CLEANUP_FAILED",
  reconciliation: "RECONCILIATION_FAILED",
  list: "LIST_FAILED",
  "signed-url": "SIGNED_URL_FAILED",
};

function defaultRetryable(stage: TenantEvidenceStage): boolean {
  return stage !== "validation";
}

export class TenantEvidenceError extends Error {
  readonly stage: TenantEvidenceStage;
  readonly code: TenantEvidenceErrorCode;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly cleanupError?: unknown;
  readonly reconciliationError?: unknown;
  readonly reconciliation: TenantEvidenceReconciliationState;
  readonly cleanupAttempted: boolean;

  constructor(
    message: string,
    options: {
      stage: TenantEvidenceStage;
      code?: TenantEvidenceErrorCode;
      retryable?: boolean;
      cause?: unknown;
      cleanupError?: unknown;
      reconciliationError?: unknown;
      reconciliation?: TenantEvidenceReconciliationState;
      cleanupAttempted?: boolean;
    },
  ) {
    super(message);
    this.name = "TenantEvidenceError";
    this.stage = options.stage;
    this.code = options.code ?? DEFAULT_ERROR_CODES[options.stage];
    this.retryable = options.retryable ?? defaultRetryable(options.stage);
    this.cause = options.cause;
    this.cleanupError = options.cleanupError;
    this.reconciliationError = options.reconciliationError;
    this.reconciliation = options.reconciliation ?? "not-attempted";
    this.cleanupAttempted = options.cleanupAttempted ?? false;
  }
}

