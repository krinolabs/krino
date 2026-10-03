// Which host SDKs each entry point may never reach. `ai` and `@anthropic-ai/claude-agent-sdk` are
// optional peers: a user of one host must not need the other host's SDK, and the root entry and
// the CLI must not need either.

const AI_SDK = "ai";
const ANTHROPIC_PACKAGES = "@anthropic-ai/*";

export type HostSdkImportRule = {
  packageName: string;
  /** Package path of the entry file. */
  entryPath: string;
  /** Packages (and their subpaths) the entry's import graph must not reach. */
  forbiddenSpecifiers: Array<string>;
};

export const HOST_SDK_IMPORT_RULES: ReadonlyArray<HostSdkImportRule> = [
  {
    packageName: "@krinolabs/krino",
    entryPath: "dist/index.js",
    forbiddenSpecifiers: [AI_SDK, ANTHROPIC_PACKAGES],
  },
  {
    packageName: "@krinolabs/krino",
    entryPath: "dist/adapters/ai-sdk/index.js",
    forbiddenSpecifiers: [ANTHROPIC_PACKAGES],
  },
  {
    packageName: "@krinolabs/krino",
    entryPath: "dist/adapters/claude-agent-sdk/index.js",
    forbiddenSpecifiers: [AI_SDK],
  },
  {
    packageName: "@krinolabs/cli",
    entryPath: "dist/index.js",
    // The CLI's krino entries that import a host SDK are forbidden too.
    forbiddenSpecifiers: [
      AI_SDK,
      ANTHROPIC_PACKAGES,
      "@krinolabs/krino/ai-sdk",
      "@krinolabs/krino/claude-agent-sdk",
      "@krinolabs/krino/providers/jev",
    ],
  },
];
