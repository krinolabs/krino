import type { InstallMode } from "../e2e-context.js";
import type { PackedManifest } from "../tarball/packed-package.js";

// Plans a consumer project: its package.json, its pnpm-workspace.yaml settings and the install
// command. Pure; the global setup does the I/O.
//
// Offline (default, CI): the override list is generated from the packed package.json files plus
// the consumer's extras. Every third-party package links to the copy the workspace already has
// installed, so pnpm needs no registry metadata and no network.
// Online (E2E_ONLINE=1): third-party packages come from the registry at their published ranges.
// Both modes pin the packed packages to their tarballs, so @krinolabs/cli's dependency on
// @krinolabs/krino never resolves to the empty placeholder on npm.

export type PlannedPackedPackage = {
  manifest: PackedManifest;
  tarballPath: string;
  /** The package's folder in the monorepo; its node_modules holds its installed dependencies. */
  workspaceDirectory: string;
};

/** A package the consumer installs next to the tarballs, at the version the workspace tests. */
export type ExtraDependency = {
  dependencyName: string;
  version: string;
  /** The workspace folder whose node_modules has it installed. */
  workspaceDirectory: string;
};

export type ConsumerPlanInput = {
  consumerName: string;
  installMode: InstallMode;
  packedPackages: ReadonlyArray<PlannedPackedPackage>;
  extraDependencies: ReadonlyArray<ExtraDependency>;
  /** The real folder of `dependencyName` as installed for `fromDirectory`. Offline mode only. */
  resolveInstalledDirectory: (dependencyName: string, fromDirectory: string) => string;
  /** Offline only: an empty store and metadata cache, so nothing outside the temp folder is read. */
  storeDirectory: string;
  cacheDirectory: string;
};

export type ConsumerManifest = {
  name: string;
  private: true;
  type: "module";
  dependencies: Record<string, string>;
};

export type ConsumerSettings = {
  overrides: Record<string, string>;
  storeDir?: string;
  cacheDir?: string;
};

export type ConsumerPlan = {
  manifest: ConsumerManifest;
  settings: ConsumerSettings;
  /** package.json text. */
  manifestJson: string;
  /** pnpm-workspace.yaml text: JSON, which is valid YAML. */
  settingsYaml: string;
  /** Arguments for `pnpm`. */
  installArguments: Array<string>;
};

function forwardSlashes(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

/** The first entry for a name wins. Map keys keep names like `__proto__` as plain names. */
function addOnce(specifiersByName: Map<string, string>, dependencyName: string, specifier: string) {
  if (!specifiersByName.has(dependencyName)) {
    specifiersByName.set(dependencyName, specifier);
  }
}

function buildOverrides(planInput: ConsumerPlanInput): Map<string, string> {
  const overrides = new Map<string, string>();
  const packedNames = new Set(
    planInput.packedPackages.map((packedPackage) => packedPackage.manifest.name),
  );
  for (const packedPackage of planInput.packedPackages) {
    addOnce(
      overrides,
      packedPackage.manifest.name,
      `file:${forwardSlashes(packedPackage.tarballPath)}`,
    );
  }
  if (planInput.installMode === "online") {
    return overrides;
  }
  const linkTo = (dependencyName: string, fromDirectory: string): string =>
    `link:${forwardSlashes(planInput.resolveInstalledDirectory(dependencyName, fromDirectory))}`;
  for (const packedPackage of planInput.packedPackages) {
    const dependencyNames = [
      ...packedPackage.manifest.dependencies.keys(),
      ...packedPackage.manifest.optionalDependencies.keys(),
    ];
    for (const dependencyName of dependencyNames) {
      if (!packedNames.has(dependencyName) && !overrides.has(dependencyName)) {
        addOnce(
          overrides,
          dependencyName,
          linkTo(dependencyName, packedPackage.workspaceDirectory),
        );
      }
    }
  }
  for (const extraDependency of planInput.extraDependencies) {
    if (!overrides.has(extraDependency.dependencyName)) {
      addOnce(
        overrides,
        extraDependency.dependencyName,
        linkTo(extraDependency.dependencyName, extraDependency.workspaceDirectory),
      );
    }
  }
  return overrides;
}

export function planConsumerProject(planInput: ConsumerPlanInput): ConsumerPlan {
  const dependencies = new Map<string, string>();
  for (const packedPackage of planInput.packedPackages) {
    addOnce(
      dependencies,
      packedPackage.manifest.name,
      `file:${forwardSlashes(packedPackage.tarballPath)}`,
    );
  }
  for (const extraDependency of planInput.extraDependencies) {
    addOnce(dependencies, extraDependency.dependencyName, extraDependency.version);
  }
  const manifest: ConsumerManifest = {
    name: planInput.consumerName,
    private: true,
    type: "module",
    // Object.fromEntries defines own properties, so `__proto__` stays a plain key.
    dependencies: Object.fromEntries(dependencies),
  };
  const isOffline = planInput.installMode === "offline";
  const settings: ConsumerSettings = {
    overrides: Object.fromEntries(buildOverrides(planInput)),
    ...(isOffline
      ? {
          storeDir: forwardSlashes(planInput.storeDirectory),
          cacheDir: forwardSlashes(planInput.cacheDirectory),
        }
      : {}),
  };
  return {
    manifest,
    settings,
    manifestJson: `${JSON.stringify(manifest, null, 2)}\n`,
    settingsYaml: `${JSON.stringify(settings, null, 2)}\n`,
    installArguments: isOffline
      ? ["install", "--offline", "--no-frozen-lockfile"]
      : ["install", "--no-frozen-lockfile"],
  };
}
