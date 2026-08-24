import { createClient } from "@supabase/supabase-js";
import { createTenantEvidenceKit } from "../src/index";

const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
);

const kit = createTenantEvidenceKit(supabase);

async function example(file: Blob, tenantId: string, subjectId: string) {
  const evidence = await kit.uploadEvidence({
    tenantId,
    subjectId,
    body: file,
    fileName: "inspection-photo.jpg",
    contentType: "image/jpeg",
    kind: "photo",
    note: "Captured after service completion",
  });

  const access = await kit.createSignedEvidenceUrl({
    filePath: evidence.filePath,
    expiresInSeconds: 120,
  });

  console.log(evidence);
  console.log(access.url);
}

void example;
