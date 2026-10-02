import { createRequire } from "node:module";
import { stripVTControlCharacters } from "node:util";
import { defineCommand, type RunMainOptions, renderUsage } from "citty";
import { renderBanner } from "./banner/krino-banner.js";
import { type ColorSupportInputs, createTextStyle, supportsColor } from "./terminal/text-style.js";

function readPackageVersion(): string {
  try {
    // Built to dist/index.js, so the manifest is one folder up, both in the repo and on npm.
    const packageManifest: unknown = createRequire(import.meta.url)("../package.json");
    if (
      typeof packageManifest === "object" &&
      packageManifest !== null &&
      "version" in packageManifest &&
      typeof packageManifest.version === "string"
    ) {
      return packageManifest.version;
    }
  } catch {
    // Fall through: a missing version must not stop the CLI.
  }
  return "unknown";
}

/** Subcommands load lazily, so `krino report` never loads `bench`'s dependencies. */
export const mainCommand = defineCommand({
  meta: {
    name: "krino",
    version: readPackageVersion(),
    description: "Reports, benchmarks and setup checks for krino.",
  },
  subCommands: {
    report: () => import("./commands/report.js").then((reportModule) => reportModule.reportCommand),
  },
});

/**
 * Usage text with the banner on top. The banner shows only at a terminal; colors (citty's
 * included) only when `supportsColor` allows them.
 */
export function decorateUsage(usageText: string, colorSupportInputs: ColorSupportInputs): string {
  const useColor = supportsColor(colorSupportInputs);
  const bannerText =
    colorSupportInputs.isTerminal === true
      ? `${renderBanner(createTextStyle(useColor)).join("\n")}\n\n`
      : "";
  return `${bannerText}${useColor ? usageText : stripVTControlCharacters(usageText)}\n`;
}

export const showUsageWithBanner: NonNullable<RunMainOptions["showUsage"]> = async (
  command,
  parentCommand,
) => {
  const usageText = await renderUsage(command, parentCommand);
  process.stdout.write(
    decorateUsage(usageText, { environment: process.env, isTerminal: process.stdout.isTTY }),
  );
};
