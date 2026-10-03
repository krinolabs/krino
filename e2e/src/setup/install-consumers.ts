import { realpathSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { consumerEnvironment } from "../consumer/consumer-commands.js";
import {
  type ExtraDependency,
  type PlannedPackedPackage,
  planConsumerProject,
} from "../consumer/consumer-plan.js";
import type { ConsumerProject, InstallMode, PackedPackage } from "../e2e-context.js";
import { readPackedPackage } from "../tarball/packed-package.js";
import { runCommandOrThrow } from "./run-command.js";

/** The consumer's own source files, copied into each consumer project. */
const CONSUMER_SOURCE_DIRECTORY = new URL("../../consumer/", import.meta.url);

/** Where each extra's tested version and installed copy come from in the workspace. */
const HOST_SDK_EXTRAS: ReadonlyArray<{ dependencyName: string; workspaceFolder: string }> = [
  { dependencyName: "ai", workspaceFolder: "packages/krino" },
  { dependencyName: "@anthropic-ai/claude-agent-sdk", workspaceFolder: "packages/krino" },
];
const TYPE_CHECK_EXTRAS: ReadonlyArray<{ dependencyName: string; workspaceFolder: string }> = [
  { dependencyName: "typescript", workspaceFolder: "." },
  { dependencyName: "@types/node", workspaceFolder: "." },
];

export type InstallConsumersInput = {
  workspaceRoot: string;
  workRoot: string;
  installMode: InstallMode;
  packedPackages: ReadonlyArray<PackedPackage>;
};

export type InstalledConsumers = {
  consumerWithHostSdks: ConsumerProject;
  consumerWithoutHostSdks: ConsumerProject;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The exact version a workspace package.json pins `dependencyName` to. */
async function workspaceVersionOf(
  dependencyName: string,
  workspaceDirectory: string,
): Promise<string> {
  const manifest: unknown = JSON.parse(
    await readFile(nodePath.join(workspaceDirectory, "package.json"), "utf8"),
  );
  for (const fieldName of ["devDependencies", "dependencies"]) {
    const field = isRecord(manifest) ? manifest[fieldName] : undefined;
    if (isRecord(field) && Object.hasOwn(field, dependencyName)) {
      const version = field[dependencyName];
      if (typeof version === "string") {
        return version;
      }
    }
  }
  throw new Error(`${workspaceDirectory}/package.json does not list ${dependencyName}.`);
}

async function resolveExtras(
  workspaceRoot: string,
  extras: ReadonlyArray<{ dependencyName: string; workspaceFolder: string }>,
): Promise<Array<ExtraDependency>> {
  return Promise.all(
    extras.map(async (extra) => {
      const workspaceDirectory = nodePath.join(workspaceRoot, extra.workspaceFolder);
      return {
        dependencyName: extra.dependencyName,
        version: await workspaceVersionOf(extra.dependencyName, workspaceDirectory),
        workspaceDirectory,
      };
    }),
  );
}

/** pnpm links each direct dependency into the package's own node_modules. */
function resolveInstalledDirectory(dependencyName: string, fromDirectory: string): string {
  return realpathSync(nodePath.join(fromDirectory, "node_modules", dependencyName));
}

async function installConsumer(
  consumerDirectory: string,
  installInput: InstallConsumersInput,
  plannedPackages: ReadonlyArray<PlannedPackedPackage>,
  extraDependencies: ReadonlyArray<ExtraDependency>,
): Promise<void> {
  const consumerPlan = planConsumerProject({
    consumerName: nodePath.basename(consumerDirectory),
    installMode: installInput.installMode,
    packedPackages: plannedPackages,
    extraDependencies,
    resolveInstalledDirectory,
    storeDirectory: nodePath.join(installInput.workRoot, "pnpm-store"),
    cacheDirectory: nodePath.join(installInput.workRoot, "pnpm-cache"),
  });
  await mkdir(consumerDirectory, { recursive: true });
  await cp(CONSUMER_SOURCE_DIRECTORY, consumerDirectory, { recursive: true });
  await writeFile(nodePath.join(consumerDirectory, "package.json"), consumerPlan.manifestJson);
  await writeFile(
    nodePath.join(consumerDirectory, "pnpm-workspace.yaml"),
    consumerPlan.settingsYaml,
  );
  await runCommandOrThrow("pnpm", consumerPlan.installArguments, {
    workingDirectory: consumerDirectory,
    environment: consumerEnvironment(),
  });
}

/**
 * Installs two consumer projects from the tarballs: one with both host SDKs and the type-check
 * tools, one with nothing else (to prove the root entry needs no host SDK).
 */
export async function installConsumers(
  installInput: InstallConsumersInput,
): Promise<InstalledConsumers> {
  const plannedPackages = await Promise.all(
    installInput.packedPackages.map(async (packedPackage) => ({
      manifest: (await readPackedPackage(packedPackage.tarballPath)).manifest,
      tarballPath: packedPackage.tarballPath,
      workspaceDirectory: packedPackage.workspaceDirectory,
    })),
  );
  const consumerWithHostSdks: ConsumerProject = {
    directory: nodePath.join(installInput.workRoot, "consumer-with-host-sdks"),
    hasHostSdks: true,
  };
  const consumerWithoutHostSdks: ConsumerProject = {
    directory: nodePath.join(installInput.workRoot, "consumer-without-host-sdks"),
    hasHostSdks: false,
  };
  const fullExtras = await resolveExtras(installInput.workspaceRoot, [
    ...HOST_SDK_EXTRAS,
    ...TYPE_CHECK_EXTRAS,
  ]);
  // One after the other: both installs write to the same store.
  await installConsumer(consumerWithHostSdks.directory, installInput, plannedPackages, fullExtras);
  await installConsumer(consumerWithoutHostSdks.directory, installInput, plannedPackages, []);
  return { consumerWithHostSdks, consumerWithoutHostSdks };
}
