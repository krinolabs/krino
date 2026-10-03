import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import nodePath from "node:path";
import { pathToFileURL } from "node:url";

// Prints which @krinolabs/krino this project installed: the one it imports itself, and the one
// @krinolabs/cli imports. The e2e test compares both with the packed tarball.

type InstalledKrino = {
  resolvedFrom: "consumer" | "@krinolabs/cli";
  packageJsonText: string;
  hasDistFolder: boolean;
  createKrinoType: string;
};

async function describeInstalledKrino(
  resolvedFrom: InstalledKrino["resolvedFrom"],
  packageJsonPath: string,
): Promise<InstalledKrino> {
  const packageDirectory = nodePath.dirname(packageJsonPath);
  const entryUrl = pathToFileURL(nodePath.join(packageDirectory, "dist", "index.js")).href;
  const krinoModule: Record<string, unknown> = await import(entryUrl);
  return {
    resolvedFrom,
    packageJsonText: readFileSync(packageJsonPath, "utf8"),
    hasDistFolder: existsSync(nodePath.join(packageDirectory, "dist")),
    createKrinoType: typeof krinoModule.createKrino,
  };
}

const consumerRequire = createRequire(import.meta.url);
const cliPackageJsonPath = realpathSync(consumerRequire.resolve("@krinolabs/cli/package.json"));
const cliRequire = createRequire(cliPackageJsonPath);

console.log(
  JSON.stringify([
    await describeInstalledKrino(
      "consumer",
      consumerRequire.resolve("@krinolabs/krino/package.json"),
    ),
    await describeInstalledKrino(
      "@krinolabs/cli",
      cliRequire.resolve("@krinolabs/krino/package.json"),
    ),
  ]),
);
