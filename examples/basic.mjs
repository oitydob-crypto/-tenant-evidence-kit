import { createClient } from "@supabase/supabase-js";
import { createTenantEvidenceKit } from "tenant-evidence-kit";

const requiredEnvironment = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "TENANT_ID",
  "SUBJECT_ID",
];

const missing = requiredEnvironment.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(
    `Set ${missing.join(", ")} before running npm run example. Use an authenticated publishable-key client.`,
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY,
);
const evidence = createTenantEvidenceKit(supabase);

const record = await evidence.uploadEvidence({
  tenantId: process.env.TENANT_ID,
  subjectId: process.env.SUBJECT_ID,
  body: new Blob(["synthetic Tenant Evidence Kit example"]),
  fileName: "inspection-photo.txt",
  contentType: "text/plain",
  kind: "document",
  note: "Synthetic example object; do not use production evidence.",
});

const access = await evidence.createSignedEvidenceUrl({
  filePath: record.filePath,
  expiresInSeconds: 120,
});

console.log({ record, signedUrl: access.url });

