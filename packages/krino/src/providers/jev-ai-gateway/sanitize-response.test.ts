import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sanitizeJevResponseBody } from "./sanitize-response.js";

describe("sanitizeJevResponseBody", () => {
  it("keeps answers, model, usage, rounding and numeric metadata; redacts other strings", () => {
    const liveBody = {
      answers: {
        question_0: { type: "boolean", probability: 0.93 },
        question_1: {
          type: "choice",
          choice: "search",
          probabilities: { search: 0.8, readFile: 0.2 },
          explanation: "the user said: my password is hunter2",
        },
      },
      model: "typesafe-ai/jev-fixture-version",
      usage: { inputTokens: 512, outputTokens: 2, note: "free text" },
      rounding: { probabilityDecimals: 2 },
      warnings: [{ type: "other", message: "echo: summarize my medical record" }],
      providerMetadata: {
        gateway: {
          cost: "0.0000215",
          generationId: "gen_01J9EXAMPLE",
          routing: { provider: "typesafe-ai", attempts: 1, fallback: false },
        },
      },
      state: { task: "Summarize my medical record" },
    };

    expect(sanitizeJevResponseBody(liveBody)).toEqual({
      answers: {
        question_0: { type: "boolean", probability: 0.93 },
        question_1: {
          type: "choice",
          choice: "search",
          probabilities: { search: 0.8, readFile: 0.2 },
        },
      },
      model: "typesafe-ai/jev-fixture-version",
      usage: { inputTokens: 512, outputTokens: 2 },
      rounding: { probabilityDecimals: 2 },
      warnings: [],
      providerMetadata: {
        gateway: {
          cost: "0.0000215",
          generationId: "[redacted]",
          routing: { provider: "[redacted]", attempts: 1, fallback: false },
        },
      },
    });
  });

  it("returns null for a body that is not an object", () => {
    expect(sanitizeJevResponseBody("not json")).toBeNull();
  });
});

describe("committed Jev fixtures", () => {
  const fixtureDirectory = new URL("./fixtures/", import.meta.url);
  const fixtureNames = readdirSync(fixtureDirectory).filter((fileName) =>
    fileName.endsWith(".json"),
  );

  it.each(fixtureNames)("%s holds no key, generation id or prompt text", (fixtureName) => {
    const fixtureText = readFileSync(new URL(fixtureName, fixtureDirectory), "utf8");
    expect(fixtureText).not.toMatch(/vck_|sk-|Bearer|gen_[0-9A-Z]/);
    expect(fixtureText).not.toMatch(/"(state|task|recentMessages|instructions)"/);
  });

  it.each(fixtureNames)("%s success bodies are already sanitized", (fixtureName) => {
    const fixture: { status: number; body: unknown } = JSON.parse(
      readFileSync(new URL(fixtureName, fixtureDirectory), "utf8"),
    );
    if (fixture.status !== 200) {
      return;
    }
    expect(sanitizeJevResponseBody(fixture.body)).toEqual(fixture.body);
  });
});
