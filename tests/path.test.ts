import { describe, expect, it } from "vitest";

import { buildEvidencePath, sanitizeFileName } from "../src/path";

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
        tenantId: "tenant-id",
        subjectId: "subject-id",
        objectId: "object-id",
        fileName: "photo one.jpg",
      }),
    ).toBe("tenant-id/subject-id/object-id-photo_one.jpg");
  });

  it("rejects missing scope identifiers", () => {
    expect(() =>
      buildEvidencePath({
        tenantId: "",
        subjectId: "subject-id",
        objectId: "object-id",
        fileName: "photo.jpg",
      }),
    ).toThrow("tenantId is required");
  });
});
