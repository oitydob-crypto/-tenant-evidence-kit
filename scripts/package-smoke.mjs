import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const npmCache = join(packageRoot, ".npm-cache");
const smokeRoot = join(
  tmpdir(),
  `tenant-evidence-kit-package-smoke-${process.pid}-${Date.now()}`,
);

function runNpm(args, options) {
  const npmArgs = ["--cache", npmCache, ...args];
  if (process.platform === "win32" && process.env.npm_execpath) {
    return execFileSync(process.execPath, [process.env.npm_execpath, ...npmArgs], options);
  }
  return execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", npmArgs, options);
}

mkdirSync(smokeRoot, { recursive: true });

try {
  const tarballName = runNpm(
    ["pack", "--pack-destination", smokeRoot, "--json"],
    { cwd: packageRoot, encoding: "utf8" },
  );
  const packMetadata = JSON.parse(tarballName);
  const [{ filename }] = Array.isArray(packMetadata)
    ? packMetadata
    : Object.values(packMetadata);
  const tarball = join(smokeRoot, filename);

  writeFileSync(
    join(smokeRoot, "consumer.mjs"),
    'const kit = await import("tenant-evidence-kit");\nif (typeof kit.createTenantEvidenceKit !== "function") throw new Error("package export missing");\n',
  );

  runNpm(
    ["install", "--ignore-scripts", "--no-save", tarball],
    { cwd: smokeRoot, stdio: "inherit" },
  );
  execFileSync(process.execPath, [join(smokeRoot, "consumer.mjs")], {
    cwd: smokeRoot,
    stdio: "inherit",
  });

  if (!existsSync(tarball)) {
    throw new Error("npm pack did not produce a package archive");
  }
  console.log(`Package smoke test passed for ${filename}`);
} finally {
  rmSync(smokeRoot, { recursive: true, force: true });
}

