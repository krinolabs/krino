import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { StepContext } from "../contracts/index.js";
import { CONTENT_HASH_PREFIX, hashContent, REDACTED_TEXT, redactStepContext } from "./index.js";

const RAW_TASK_TEXT = "Wire $4,210 to account 5512-0098 for Dana Whitfield";
const RAW_MESSAGES = "user: my password is hunter2";

function stepContext(contextFields: Partial<StepContext> = {}): StepContext {
  return {
    runIdentifier: "run-1",
    stepNumber: 2,
    taskText: RAW_TASK_TEXT,
    availableTools: [{ toolName: "sendPayment", toolDescription: "Send a payment." }],
    recentMessagesText: RAW_MESSAGES,
    ...contextFields,
  };
}

describe("hashContent", () => {
  it("is SHA-256 with the sha256: prefix", () => {
    expect(hashContent("abc")).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hashContent("")).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("hashes the UTF-8 bytes", () => {
    const utf8Bytes = Buffer.from([0xc3, 0xa9]);
    expect(hashContent("é")).toBe(`sha256:${createHash("sha256").update(utf8Bytes).digest("hex")}`);
  });

  it("always returns the prefix and 64 hex characters, and never the input", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (content) => {
        const contentHash = hashContent(content);
        expect(contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(contentHash.startsWith(CONTENT_HASH_PREFIX)).toBe(true);
        expect(hashContent(content)).toBe(contentHash);
      }),
    );
  });
});

describe("redactStepContext", () => {
  it("redacts task text and recent messages by default", () => {
    const redacted = redactStepContext(stepContext());
    expect(redacted).toEqual({
      runIdentifier: "run-1",
      stepNumber: 2,
      taskText: REDACTED_TEXT,
      availableTools: [{ toolName: "sendPayment", toolDescription: "Send a payment." }],
      recentMessagesText: REDACTED_TEXT,
    });
    expect(JSON.stringify(redacted)).not.toContain(RAW_TASK_TEXT);
    expect(JSON.stringify(redacted)).not.toContain("hunter2");
  });

  it("redacts with redactContent: true", () => {
    expect(redactStepContext(stepContext(), { redactContent: true }).taskText).toBe(REDACTED_TEXT);
  });

  it("keeps empty text empty, so a redacted step still shows it had no messages", () => {
    expect(redactStepContext(stepContext({ recentMessagesText: "" })).recentMessagesText).toBe("");
  });

  it("keeps the raw text with redactContent: false", () => {
    expect(redactStepContext(stepContext(), { redactContent: false })).toEqual(stepContext());
  });

  it("returns a copy and never changes its input", () => {
    const original = stepContext();
    const redacted = redactStepContext(original);
    expect(original.taskText).toBe(RAW_TASK_TEXT);
    expect(redacted.availableTools).not.toBe(original.availableTools);
    expect(redacted.availableTools[0]).not.toBe(original.availableTools[0]);
  });
});
