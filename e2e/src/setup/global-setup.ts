import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";
import type { E2eContext } from "../e2e-context.js";
import { installConsumers } from "./install-consumers.js";
import { packPackages } from "./pack-packages.js";

// Runs once before every test file: packs the packages into a temp folder, installs the consumer
// projects from the tarballs, and hands the paths to the tests. Afterwards it deletes the folder
// (unless KRINO_E2E_KEEP=1, to inspect a failure) and fails the run if it took longer than the
// budget: WP-14 must run in CI in under 3 minutes, and the packages' build runs before this.

const WORKSPACE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** Pack, install and every test file. Online mode downloads packages, so it gets no budget. */
export const OFFLINE_RUN_BUDGET_IN_SECONDS = 150;

function secondsSince(startedAt: number): number {
  return (performance.now() - startedAt) / 1000;
}

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
  console.log(
    `e2e: packed and installed (${installMode}) in ${secondsSince(startedAt).toFixed(1)}s at ${workRoot}`,
  );
  return async () => {
    if (process.env.KRINO_E2E_KEEP !== "1") {
      await rm(workRoot, { recursive: true, force: true, maxRetries: 5 });
    }
    const runSeconds = secondsSince(startedAt);
    console.log(`e2e: finished in ${runSeconds.toFixed(1)}s`);
    if (installMode === "offline" && runSeconds > OFFLINE_RUN_BUDGET_IN_SECONDS) {
      throw new Error(
        `e2e took ${runSeconds.toFixed(1)}s, over its ${OFFLINE_RUN_BUDGET_IN_SECONDS}s budget.`,
      );
    }
  };
}
