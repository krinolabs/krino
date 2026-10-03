import { describe, expect, it } from "vitest";
import type { PackedManifest } from "../tarball/packed-package.js";
import { type ConsumerPlanInput, planConsumerProject } from "./consumer-plan.js";

function manifest(
  name: string,
  version: string,
  dependencies: Array<[string, string]> = [],
): PackedManifest {
  return {
    name,
    version,
    dependencies: new Map(dependencies),
    optionalDependencies: new Map(),
    exportKeys: [],
  };
}

const KRINO = {
  manifest: manifest("@krinolabs/krino", "0.0.1"),
  tarballPath: "/tmp/e2e/tarballs/krino/krinolabs-krino-0.0.1.tgz",
  workspaceDirectory: "/repo/packages/krino",
};

const CLI = {
  manifest: manifest("@krinolabs/cli", "0.0.0", [
    ["@krinolabs/krino", "^0.0.1"],
    ["citty", "0.2.2"],
    ["@duckdb/node-api", "1.5.6-r.1"],
  ]),
  tarballPath: "/tmp/e2e/tarballs/cli/krinolabs-cli-0.0.0.tgz",
  workspaceDirectory: "/repo/packages/cli",
};

function planInput(overrides: Partial<ConsumerPlanInput>): ConsumerPlanInput {
  return {
    consumerName: "krino-e2e-consumer",
    installMode: "offline",
    packedPackages: [KRINO, CLI],
    extraDependencies: [
      { dependencyName: "ai", version: "7.0.126", workspaceDirectory: "/repo/packages/krino" },
    ],
    resolveInstalledDirectory: (dependencyName, fromDirectory) =>
      `/store/${dependencyName}@from${fromDirectory}`,
    storeDirectory: "/tmp/e2e/store",
    cacheDirectory: "/tmp/e2e/cache",
    ...overrides,
  };
}

describe("planConsumerProject", () => {
  it("installs the tarballs and the extras as direct dependencies", () => {
    const consumerPlan = planConsumerProject(planInput({}));
    expect(consumerPlan.manifest.dependencies).toEqual({
      "@krinolabs/krino": `file:${KRINO.tarballPath}`,
      "@krinolabs/cli": `file:${CLI.tarballPath}`,
      ai: "7.0.126",
    });
  });

  it("offline: links every tarball dependency and extra to the workspace's installed copy", () => {
    const consumerPlan = planConsumerProject(planInput({}));
    expect(consumerPlan.settings.overrides).toEqual({
      "@krinolabs/krino": `file:${KRINO.tarballPath}`,
      "@krinolabs/cli": `file:${CLI.tarballPath}`,
      citty: "link:/store/citty@from/repo/packages/cli",
      "@duckdb/node-api": "link:/store/@duckdb/node-api@from/repo/packages/cli",
      ai: "link:/store/ai@from/repo/packages/krino",
    });
    expect(consumerPlan.installArguments).toEqual(["install", "--offline", "--no-frozen-lockfile"]);
    expect(consumerPlan.settings.storeDir).toBe("/tmp/e2e/store");
    expect(consumerPlan.settings.cacheDir).toBe("/tmp/e2e/cache");
    // pnpm's default autoInstallPeers stays on, as for a user: ai's peer zod is installed, and
    // krino's peers (ai, the Agent SDK) are optional, so pnpm never adds them.
    expect(Object.hasOwn(consumerPlan.settings, "autoInstallPeers")).toBe(false);
  });

  it("online: overrides only the packed packages, so the CLI never gets the npm placeholder", () => {
    const consumerPlan = planConsumerProject(planInput({ installMode: "online" }));
    expect(consumerPlan.settings.overrides).toEqual({
      "@krinolabs/krino": `file:${KRINO.tarballPath}`,
      "@krinolabs/cli": `file:${CLI.tarballPath}`,
    });
    expect(consumerPlan.installArguments).toEqual(["install", "--no-frozen-lockfile"]);
    expect(consumerPlan.settings.storeDir).toBeUndefined();
    expect(consumerPlan.settings.cacheDir).toBeUndefined();
  });

  it("writes forward slashes in file: and link: paths, so Windows paths work in YAML", () => {
    const consumerPlan = planConsumerProject(
      planInput({
        packedPackages: [{ ...KRINO, tarballPath: "C:\\Temp\\krino.tgz" }],
        extraDependencies: [],
      }),
    );
    expect(consumerPlan.settings.overrides).toEqual({
      "@krinolabs/krino": "file:C:/Temp/krino.tgz",
    });
  });

  it("keeps dependency names that collide with Object.prototype as plain keys", () => {
    const oddPackage = {
      manifest: manifest("odd", "1.0.0", [
        ["constructor", "1.0.0"],
        ["toString", "1.0.0"],
        ["__proto__", "1.0.0"],
      ]),
      tarballPath: "/t/odd.tgz",
      workspaceDirectory: "/repo/odd",
    };
    const consumerPlan = planConsumerProject(
      planInput({ packedPackages: [oddPackage], extraDependencies: [] }),
    );
    const overrideNames = Object.keys(consumerPlan.settings.overrides);
    expect(overrideNames).toEqual(["odd", "constructor", "toString", "__proto__"]);
    expect(Object.hasOwn(consumerPlan.settings.overrides, "__proto__")).toBe(true);
    const writtenSettings: { overrides: Record<string, string> } = JSON.parse(
      consumerPlan.settingsYaml,
    );
    const writtenOverrides = writtenSettings.overrides;
    expect(Object.getOwnPropertyDescriptor(writtenOverrides, "__proto__")?.value).toBe(
      "link:/store/__proto__@from/repo/odd",
    );
  });

  it("writes package.json and pnpm-workspace.yaml text (JSON is valid YAML)", () => {
    const consumerPlan = planConsumerProject(planInput({}));
    expect(JSON.parse(consumerPlan.manifestJson)).toEqual(consumerPlan.manifest);
    expect(JSON.parse(consumerPlan.settingsYaml)).toEqual(consumerPlan.settings);
    expect(consumerPlan.manifest.private).toBe(true);
    expect(consumerPlan.manifest.type).toBe("module");
  });
});
