import { describe, expect, it } from "vitest";

import {
  buildEvidencePath,
  sanitizeFileName,
  validateEvidenceFilePath,
} from "../src/path.js";

const tenantId = "10000000-0000-4000-8000-000000000001";
const objectId = "20000000-0000-4000-8000-000000000001";

describe("sanitizeFileName", () => {
  it("normalizes unsafe characters without removing the extension", () => {
    expect(sanitizeFileName("  before & after (1).jpg ")).toBe(
      "before_after_1_.jpg",
    );
  });

  it("falls back when a name has no safe characters", () => {
    expect(sanitizeFileName("***")).toBe("evidence");
  });
});

describe("buildEvidencePath", () => {
  it("keeps tenant and subject as the first path segments", () => {
    expect(
      buildEvidencePath({
        tenantId,
        subjectId: "subject-id",
        objectId,
        fileName: "photo one.jpg",
      }),
    ).toBe(`${tenantId}/subject-id/${objectId}-photo_one.jpg`);
  });

  it("normalizes UUID casing and surrounding whitespace", () => {
    expect(
      buildEvidencePath({
        tenantId: tenantId.toUpperCase(),
        subjectId: " subject-id ",
        objectId: objectId.toUpperCase(),
        fileName: "photo.jpg",
      }),
    ).toBe(`${tenantId}/subject-id/${objectId}-photo.jpg`);
  });

  it("rejects missing or unsafe scope identifiers", () => {
    expect(() =>
      buildEvidencePath({
        tenantId: "",
        subjectId: "subject-id",
        objectId,
        fileName: "photo.jpg",
      }),
    ).toThrow("tenantId must be a UUID");

    expect(() =>
      buildEvidencePath({
        tenantId,
        subjectId: "subject/id",
        objectId,
        fileName: "photo.jpg",
      }),
    ).toThrow("subjectId must be a safe path segment");
  });
});

describe("validateEvidenceFilePath", () => {
  it("accepts the canonical TEK object path", () => {
    expect(
      validateEvidenceFilePath(`${tenantId}/subject-id/${objectId}-photo.jpg`),
    ).toBe(`${tenantId}/subject-id/${objectId}-photo.jpg`);
  });

  it("rejects paths that can escape the evidence namespace", () => {
    expect(() => validateEvidenceFilePath("../other/file.jpg")).toThrow(
      "tenantId must be a UUID",
    );
    expect(() =>
      validateEvidenceFilePath(`${tenantId}/subject-id/not-a-uuid-photo.jpg`),
    ).toThrow("filePath must contain a UUID object id and file name");
  });
});

