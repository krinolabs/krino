import nodePath from "node:path";
import ts from "typescript";

// Lists what each public entry point exports, as a consumer's TypeScript sees it through the
// installed package, and what a consumer file imports from each entry.

export type EntryExports = {
  /** For example `@krinolabs/krino/ai-sdk`. */
  specifier: string;
  exportedNames: Array<string>;
  importedNames: Array<string>;
};

/** `@krinolabs/krino` plus each subpath in the packed `exports` map, except `./package.json`. */
export function publicEntrySpecifiers(packageName: string, exportKeys: ReadonlyArray<string>) {
  return exportKeys
    .filter((exportKey) => exportKey !== "./package.json")
    .map((exportKey) =>
      exportKey === "." ? packageName : `${packageName}/${exportKey.slice("./".length)}`,
    );
}

/** The exports of every module the consumer file imports, with the names it imports. */
export function readEntryExports(consumerFilePath: string): Array<EntryExports> {
  const program = ts.createProgram([consumerFilePath], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    types: [],
  });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(nodePath.resolve(consumerFilePath));
  if (sourceFile === undefined) {
    throw new Error(`TypeScript did not load ${consumerFilePath}.`);
  }
  return sourceFile.statements.flatMap((statement): Array<EntryExports> => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      return [];
    }
    const moduleSymbol = checker.getSymbolAtLocation(statement.moduleSpecifier);
    const namedBindings = statement.importClause?.namedBindings;
    const importedNames =
      namedBindings !== undefined && ts.isNamedImports(namedBindings)
        ? namedBindings.elements.map((element) => (element.propertyName ?? element.name).text)
        : [];
    return [
      {
        specifier: statement.moduleSpecifier.text,
        exportedNames:
          moduleSymbol === undefined
            ? []
            : checker.getExportsOfModule(moduleSymbol).map((exportSymbol) => exportSymbol.name),
        importedNames,
      },
    ];
  });
}

/** Exported names the consumer file does not import, by entry. */
export function findUncoveredExports(
  entryExports: ReadonlyArray<EntryExports>,
): Array<{ specifier: string; missingNames: Array<string> }> {
  return entryExports.flatMap((entry) => {
    const importedNames = new Set(entry.importedNames);
    const missingNames = entry.exportedNames.filter(
      (exportedName) => !importedNames.has(exportedName),
    );
    return missingNames.length === 0 ? [] : [{ specifier: entry.specifier, missingNames }];
  });
}
