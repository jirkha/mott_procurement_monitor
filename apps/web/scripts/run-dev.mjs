#!/usr/bin/env node
/**
 * Uvolní Next.js 16 dev lock (.next/dev/lock): ukončí běžící PID ze souboru,
 * nebo smaže zastaralý lock, pak spustí `next dev`.
 */
import { spawn } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const lockPath = join(appRoot, ".next", "dev", "lock");

function tryReleaseDevLock() {
  let raw;
  try {
    raw = readFileSync(lockPath, "utf8");
  } catch {
    return;
  }

  let info;
  try {
    info = JSON.parse(raw);
  } catch {
    try {
      unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
    return;
  }

  const pid = info?.pid;
  if (typeof pid !== "number" || pid === process.pid) {
    return;
  }

  try {
    process.kill(pid, 0);
    process.kill(pid);
  } catch {
    try {
      unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
  }
}

tryReleaseDevLock();

const require = createRequire(import.meta.url);
const nextPkgDir = dirname(
  require.resolve("next/package.json", { paths: [appRoot] }),
);
const nextBin = join(nextPkgDir, "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, "dev"], {
  cwd: appRoot,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});
