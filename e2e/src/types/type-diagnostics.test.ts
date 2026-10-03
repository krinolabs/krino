import { describe, expect, it } from "vitest";
import { classifyTypeDiagnostics } from "./type-diagnostics.js";

const KRINO_DECLARATION =
  "node_modules/.pnpm/@krinolabs+krino@file+..+tarballs+krino.tgz/node_modules/@krinolabs/krino/dist/index.d.ts";
const LINKED_AI_DECLARATION =
  "../../../Work/krino/node_modules/.pnpm/ai@7.0.126_zod@4.6.5/node_modules/ai/dist/index.d.ts";

describe("classifyTypeDiagnostics", () => {
  it("fails on krino's declarations and the consumer's own files, counts the rest", () => {
    const tscOutput = [
      `${KRINO_DECLARATION}(12,3): error TS2304: Cannot find name 'Thing'.`,
      "src/public-api.ts(4,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      `${LINKED_AI_DECLARATION}(1151,13): error TS2304: Cannot find name 'HeadersInit'.`,
      `${LINKED_AI_DECLARATION}(6082,13): error TS2304: Cannot find name 'FileList'.`,
      "C:/Users/me/consumer/src/listed-file.ts",
    ].join("\n");
    const classified = classifyTypeDiagnostics(tscOutput);
    expect(classified.failingDiagnostics).toEqual([
      `${KRINO_DECLARATION}(12,3): error TS2304: Cannot find name 'Thing'.`,
      "src/public-api.ts(4,7): error TS2322: Type 'string' is not assignable to type 'number'.",
    ]);
    expect(classified.thirdPartyDiagnosticCount).toBe(2);
  });

  it("reads Windows paths", () => {
    const classified = classifyTypeDiagnostics(
      "node_modules\\.pnpm\\x\\node_modules\\@krinolabs\\krino\\dist\\index.d.ts(1,1): error TS1005: ';' expected.\r\n",
    );
    expect(classified.failingDiagnostics).toHaveLength(1);
  });

  it("fails on a diagnostic that has no file, such as a broken tsconfig", () => {
    const classified = classifyTypeDiagnostics(
      "error TS5058: The specified path does not exist: 'tsconfig.json'.",
    );
    expect(classified.failingDiagnostics).toEqual([
      "error TS5058: The specified path does not exist: 'tsconfig.json'.",
    ]);
  });

  it("counts a package that only starts with @krinolabs elsewhere as third-party", () => {
    const classified = classifyTypeDiagnostics(
      "node_modules/@krinolabs-fork/x/index.d.ts(1,1): error TS1005: ';' expected.",
    );
    expect(classified.failingDiagnostics).toEqual([]);
    expect(classified.thirdPartyDiagnosticCount).toBe(1);
  });
});
