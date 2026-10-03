import nodePath from "node:path";
import ts from "typescript";

// Walks a built package's import graph from one entry file, using TypeScript's import scanner,
// which (unlike a regex) skips import text inside strings, such as `krino init`'s code snippets.

export type BareImport = {
  /** A package import, for example `ai` or `node:path`. */
  specifier: string;
  /** The package path of the file that imports it. */
  importedBy: string;
};

/** Static imports, re-exports, side-effect imports and dynamic `import("…")`, in source order. */
export function collectImportSpecifiers(sourceText: string): Array<string> {
  return ts
    .preProcessFile(sourceText, true, true)
    .importedFiles.map((importedFile) => importedFile.fileName);
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

/**
 * Every package import reachable from `entryPath` through relative imports. `filesByPath` holds the
 * package's JavaScript files by package path (`dist/index.js`).
 */
export function findReachableBareImports(
  entryPath: string,
  filesByPath: ReadonlyMap<string, string>,
): Array<BareImport> {
  const bareImports: Array<BareImport> = [];
  const visitedPaths = new Set<string>();
  const pathsToVisit = [entryPath];
  for (
    let filePath = pathsToVisit.shift();
    filePath !== undefined;
    filePath = pathsToVisit.shift()
  ) {
    if (visitedPaths.has(filePath)) {
      continue;
    }
    visitedPaths.add(filePath);
    const sourceText = filesByPath.get(filePath);
    if (sourceText === undefined) {
      throw new Error(`The import graph reaches ${filePath}, which is not in the package.`);
    }
    for (const specifier of collectImportSpecifiers(sourceText)) {
      if (isRelativeSpecifier(specifier)) {
        pathsToVisit.push(nodePath.posix.join(nodePath.posix.dirname(filePath), specifier));
      } else {
        bareImports.push({ specifier, importedBy: filePath });
      }
    }
  }
  return bareImports;
}

/**
 * `true` when `specifier` is one of `forbiddenSpecifiers` or a subpath of one. `@scope/*` matches
 * every package of the scope.
 */
export function isForbiddenSpecifier(
  specifier: string,
  forbiddenSpecifiers: ReadonlyArray<string>,
): boolean {
  return forbiddenSpecifiers.some((forbiddenSpecifier) =>
    forbiddenSpecifier.endsWith("/*")
      ? specifier.startsWith(forbiddenSpecifier.slice(0, -1))
      : specifier === forbiddenSpecifier || specifier.startsWith(`${forbiddenSpecifier}/`),
  );
}

export function findForbiddenImports(
  bareImports: ReadonlyArray<BareImport>,
  forbiddenSpecifiers: ReadonlyArray<string>,
): Array<BareImport> {
  return bareImports.filter((bareImport) =>
    isForbiddenSpecifier(bareImport.specifier, forbiddenSpecifiers),
  );
}
