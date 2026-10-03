import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";
import type { E2eContext } from "../e2e-context.js";
import { installConsumers } from "./install-consumers.js";
import { packPackages } from "./pack-packages.js";

// Runs once before every test file: packs the packages into a temp folder, installs the consumer
// projects from the tarballs, and hands the paths to the tests. Deletes the folder afterwards
// unless KRINO_E2E_KEEP=1 (to inspect a failure).

const WORKSPACE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export default async function setup(testProject: TestProject): Promise<() => Promise<void>> {
  const startedAt = performance.now();
  const workRoot = await mkdtemp(nodePath.join(tmpdir(), "krino-e2e-"));
  const installMode = process.env.E2E_ONLINE === "1" ? "online" : "offline";
  const packedPackages = await packPackages(WORKSPACE_ROOT, nodePath.join(workRoot, "tarballs"));
  const installedConsumers = await installConsumers({
    workspaceRoot: WORKSPACE_ROOT,
    workRoot,
    installMode,
    packedPackages,
  });
  const e2eContext: E2eContext = {
    workspaceRoot: WORKSPACE_ROOT,
    installMode,
    packedPackages,
    ...installedConsumers,
  };
  testProject.provide("e2eContext", e2eContext);
  const setupSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.log(`e2e: packed and installed (${installMode}) in ${setupSeconds}s at ${workRoot}`);
  return async () => {
    if (process.env.KRINO_E2E_KEEP !== "1") {
      await rm(workRoot, { recursive: true, force: true, maxRetries: 5 });
    }
  };
}
