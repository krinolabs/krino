// What the global setup hands the test files through Vitest's `provide` / `inject`.

/** `offline` (default, CI): third-party packages link to the workspace's installed copies. */
export type InstallMode = "offline" | "online";

export type PackedPackage = {
  packageName: string;
  /** The package's folder in the monorepo. */
  workspaceDirectory: string;
  tarballPath: string;
};

export type E2eContext = {
  workspaceRoot: string;
  installMode: InstallMode;
  packedPackages: Array<PackedPackage>;
};

declare module "vitest" {
  export interface ProvidedContext {
    e2eContext: E2eContext;
  }
}
