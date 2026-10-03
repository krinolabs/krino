import { readdir } from "node:fs/promises";
import nodePath from "node:path";
import type { PackedPackage } from "../e2e-context.js";
import { runCommandOrThrow } from "./run-command.js";

/** The packages users install, by folder. `@krinolabs/cli` is still private; it is packed anyway. */
export const PACKAGES_TO_PACK: ReadonlyArray<{ packageName: string; folder: string }> = [
  { packageName: "@krinolabs/krino", folder: "packages/krino" },
  { packageName: "@krinolabs/cli", folder: "packages/cli" },
];

/**
 * Packs each package with `pnpm pack` into its own folder under `destinationDirectory`.
 * `pnpm pack`, not `npm pack`: only pnpm rewrites `workspace:` ranges into real versions.
 * Expects the packages to be built (turbo runs their `build` first).
 */
export async function packPackages(
  workspaceRoot: string,
  destinationDirectory: string,
): Promise<Array<PackedPackage>> {
  return Promise.all(
    PACKAGES_TO_PACK.map(async (packageToPack) => {
      const workspaceDirectory = nodePath.join(workspaceRoot, packageToPack.folder);
      const packDirectory = nodePath.join(
        destinationDirectory,
        nodePath.basename(packageToPack.folder),
      );
      await runCommandOrThrow("pnpm", ["pack", "--pack-destination", packDirectory], {
        workingDirectory: workspaceDirectory,
      });
      const tarballNames = (await readdir(packDirectory)).filter((fileName) =>
        fileName.endsWith(".tgz"),
      );
      const tarballName = tarballNames[0];
      if (tarballName === undefined || tarballNames.length !== 1) {
        throw new Error(`pnpm pack wrote ${tarballNames.length} tarballs to ${packDirectory}.`);
      }
      return {
        packageName: packageToPack.packageName,
        workspaceDirectory,
        tarballPath: nodePath.join(packDirectory, tarballName),
      };
    }),
  );
}
