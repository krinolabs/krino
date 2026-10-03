// What a published krino tarball may hold: the build output, README.md, LICENSE and package.json.

const PACKAGE_FOLDER_PREFIX = "package/";

const TOP_LEVEL_FILES: ReadonlySet<string> = new Set(["package.json", "README.md", "LICENSE"]);

/** Tests, fixtures and snapshots never ship, not even as build output or source maps. */
const TEST_ONLY_PATH_PATTERN = /(^|\/)(__fixtures__|fixtures|__snapshots__)\/|\.(test|spec)\./;

/** The path relative to the package root: npm and pnpm put every file under `package/`. */
export function packagePathOf(archivePath: string): string {
  return archivePath.startsWith(PACKAGE_FOLDER_PREFIX)
    ? archivePath.slice(PACKAGE_FOLDER_PREFIX.length)
    : archivePath;
}

function isAllowedPackagePath(packagePath: string): boolean {
  if (TOP_LEVEL_FILES.has(packagePath)) {
    return true;
  }
  return packagePath.startsWith("dist/") && !TEST_ONLY_PATH_PATTERN.test(packagePath);
}

/** Package paths that must not be in the tarball, in the order given. */
export function findUnexpectedTarballFiles(packagePaths: ReadonlyArray<string>): Array<string> {
  return packagePaths.filter((packagePath) => !isAllowedPackagePath(packagePath));
}
