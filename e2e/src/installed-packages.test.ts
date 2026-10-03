import { describe, expect, inject, it } from "vitest";
import "./e2e-context.js";
import { runConsumerScript } from "./consumer/consumer-commands.js";
import { readPackedPackage } from "./tarball/packed-package.js";

// @krinolabs/krino@0.0.1 exists on npm as an empty placeholder. Both the consumer's own
// dependency and the CLI's dependency must resolve to the local tarball, never to that.

const e2eContext = inject("e2eContext");

type InstalledKrino = {
  resolvedFrom: "consumer" | "@krinolabs/cli";
  packageJsonText: string;
  hasDistFolder: boolean;
  createKrinoType: string;
};

describe.each([
  ["with host SDKs", e2eContext.consumerWithHostSdks],
  ["without host SDKs", e2eContext.consumerWithoutHostSdks],
])("the consumer %s", (_consumerLabel, consumer) => {
  it("installs the packed @krinolabs/krino, for itself and for @krinolabs/cli", async () => {
    const krinoPackage = e2eContext.packedPackages.find(
      (packedPackage) => packedPackage.packageName === "@krinolabs/krino",
    );
    if (krinoPackage === undefined) {
      throw new Error("The global setup did not pack @krinolabs/krino.");
    }
    const packedManifest: unknown = JSON.parse(
      (await readPackedPackage(krinoPackage.tarballPath)).manifestText,
    );
    const scriptResult = await runConsumerScript(consumer, "src/installed-krino.ts", []);
    expect(scriptResult.exitCode, scriptResult.stderr).toBe(0);
    const installedCopies: Array<InstalledKrino> = JSON.parse(scriptResult.stdout);
    expect(installedCopies.map((installedKrino) => installedKrino.resolvedFrom)).toEqual([
      "consumer",
      "@krinolabs/cli",
    ]);
    for (const installedKrino of installedCopies) {
      expect(JSON.parse(installedKrino.packageJsonText)).toEqual(packedManifest);
      expect(installedKrino.hasDistFolder).toBe(true);
      expect(installedKrino.createKrinoType).toBe("function");
    }
  });
});
