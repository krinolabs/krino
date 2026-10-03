import { createRequire } from "node:module";

const UNKNOWN_VERSION = "unknown";

/**
 * The installed `ai` version, read from `ai/package.json` (ai exports it; it does not export its
 * `VERSION` constant). `"unknown"` when it cannot be read.
 */
export function readAiSdkVersion(): string {
  try {
    const packageJson: unknown = createRequire(import.meta.url)("ai/package.json");
    if (
      typeof packageJson === "object" &&
      packageJson !== null &&
      Object.hasOwn(packageJson, "version")
    ) {
      const { version } = packageJson as { version: unknown };
      return typeof version === "string" ? version : UNKNOWN_VERSION;
    }
    return UNKNOWN_VERSION;
  } catch {
    return UNKNOWN_VERSION;
  }
}
