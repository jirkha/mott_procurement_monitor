import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = path.join(root, ".next");

try {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log("[clean-next] Odstraněno:", nextDir);
} catch (e) {
  console.warn("[clean-next]", e);
  process.exitCode = 1;
}
