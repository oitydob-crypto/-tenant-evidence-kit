export type TenantEvidenceStage =
  | "upload"
  | "metadata"
  | "cleanup"
  | "list"
  | "signed-url";

export class TenantEvidenceError extends Error {
  readonly stage: TenantEvidenceStage;
  readonly cause?: unknown;
  readonly cleanupError?: unknown;

  constructor(
    message: string,
    options: {
      stage: TenantEvidenceStage;
      cause?: unknown;
      cleanupError?: unknown;
    },
  ) {
    super(message);
    this.name = "TenantEvidenceError";
    this.stage = options.stage;
    this.cause = options.cause;
    this.cleanupError = options.cleanupError;
  }
}
