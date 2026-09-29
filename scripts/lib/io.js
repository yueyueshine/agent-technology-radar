// ============================================================================
// Small shared I/O helpers
// ============================================================================

import { writeFile, rename } from "node:fs/promises";

// Written via a temp file plus `rename`. A plain `writeFile` that is interrupted
// leaves a truncated JSON file behind, and the workflow's commit step runs under
// `if: always()` — so that truncated file would be committed, turning a one-off
// crash into a file nobody can parse on any later run.
export async function writeJsonAtomic(path, value) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, path);
}
