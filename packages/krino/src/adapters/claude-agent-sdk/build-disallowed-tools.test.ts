import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildDisallowedTools } from "./build-disallowed-tools.js";
import { benchToolName, PROTOTYPE_KEY_NAMES } from "./test-support.js";

const toolNameArbitrary = fc.oneof(
  fc.constantFrom(...PROTOTYPE_KEY_NAMES, "Bash", "Read", "Bash(npm test:*)", "mcp__krino-bench"),
  fc.string({ minLength: 1, maxLength: 12 }),
  fc.string({ minLength: 1, maxLength: 12 }).map(benchToolName),
);
const toolNameListArbitrary = fc.array(toolNameArbitrary, { maxLength: 12 });

describe("buildDisallowedTools", () => {
  it("adds the known tools that were not suggested, after the user's entries", () => {
    expect(
      buildDisallowedTools({
        userDisallowedTools: ["WebFetch"],
        knownToolNames: [benchToolName("cancel_order"), benchToolName("approve_refund")],
        suggestedToolNames: [benchToolName("cancel_order")],
      }),
    ).toEqual(["WebFetch", benchToolName("approve_refund")]);
  });

  it("works without a user list and never repeats an entry", () => {
    expect(
      buildDisallowedTools({
        userDisallowedTools: undefined,
        knownToolNames: ["search", "search", "readFile"],
        suggestedToolNames: [],
      }),
    ).toEqual(["search", "readFile"]);
    expect(
      buildDisallowedTools({
        userDisallowedTools: ["readFile"],
        knownToolNames: ["readFile"],
        suggestedToolNames: [],
      }),
    ).toEqual(["readFile"]);
  });

  it("handles prototype-key tool names as plain names", () => {
    expect(
      buildDisallowedTools({
        userDisallowedTools: ["toString"],
        knownToolNames: [...PROTOTYPE_KEY_NAMES],
        suggestedToolNames: ["constructor"],
      }),
    ).toEqual(["toString", "__proto__"]);
  });

  it("property: keeps every user entry, adds only known tools that were not suggested", () => {
    fc.assert(
      fc.property(
        fc.option(toolNameListArbitrary, { nil: undefined }),
        toolNameListArbitrary,
        toolNameListArbitrary,
        (userDisallowedTools, knownToolNames, suggestedToolNames) => {
          const userDisallowedSnapshot = userDisallowedTools?.slice();
          const disallowedTools = buildDisallowedTools({
            userDisallowedTools,
            knownToolNames,
            suggestedToolNames,
          });
          const userEntries = userDisallowedTools ?? [];

          // The user's entries come first, unchanged and in order; the input is not mutated.
          expect(disallowedTools.slice(0, userEntries.length)).toEqual(userEntries);
          expect(userDisallowedTools).toEqual(userDisallowedSnapshot);

          const addedToolNames = disallowedTools.slice(userEntries.length);
          const knownToolNameSet = new Set(knownToolNames);
          const suggestedToolNameSet = new Set(suggestedToolNames);
          for (const addedToolName of addedToolNames) {
            expect(knownToolNameSet.has(addedToolName)).toBe(true);
            expect(suggestedToolNameSet.has(addedToolName)).toBe(false);
          }
          expect(new Set(addedToolNames).size).toBe(addedToolNames.length);

          // Every known tool that was not suggested ends up disallowed.
          const disallowedToolNameSet = new Set(disallowedTools);
          for (const knownToolName of knownToolNames) {
            if (!suggestedToolNameSet.has(knownToolName)) {
              expect(disallowedToolNameSet.has(knownToolName)).toBe(true);
            }
          }
        },
      ),
    );
  });
});
