import { readFileSync } from "node:fs";

// Test helper: a `fetch` that serves recorded fixtures and records every request. No network.

export type JevFixtureName =
  | "tool-selection-three-tools"
  | "risk-gate-unsure"
  | "choice-with-distribution"
  | "choice-without-distribution"
  | "missing-answer"
  | "error-authentication"
  | "error-rate-limit";

type JevFixture = { source: string; status: number; body: unknown };

export type RecordedFetchRequest = {
  url: string;
  headers: Headers;
  body: unknown;
  signal: AbortSignal | null;
  /** `aborted` when the request was cancelled through its signal. */
  requestOutcome: "pending" | "served" | "aborted";
};

export type FixtureFetch = {
  fetch: typeof globalThis.fetch;
  recordedRequests: Array<RecordedFetchRequest>;
};

export function loadJevFixture(fixtureName: JevFixtureName): JevFixture {
  const fixtureUrl = new URL(`./fixtures/${fixtureName}.json`, import.meta.url);
  const parsedFixture: unknown = JSON.parse(readFileSync(fixtureUrl, "utf8"));
  if (
    typeof parsedFixture !== "object" ||
    parsedFixture === null ||
    !("status" in parsedFixture) ||
    typeof parsedFixture.status !== "number" ||
    !("body" in parsedFixture)
  ) {
    throw new Error(`fixture ${fixtureName} has no status and body`);
  }
  return {
    source: "source" in parsedFixture ? String(parsedFixture.source) : "unknown",
    status: parsedFixture.status,
    body: parsedFixture.body,
  };
}

function abortError(abortSignal: AbortSignal): unknown {
  return abortSignal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

function requestBodyFrom(requestInit: RequestInit | undefined): unknown {
  return typeof requestInit?.body === "string" ? JSON.parse(requestInit.body) : null;
}

/**
 * Serves one fixture per request, in order; the last one repeats.
 * `hang` never answers: the request settles only when its signal aborts.
 */
export function createFixtureFetch(
  responses: ReadonlyArray<JevFixtureName | "hang">,
): FixtureFetch {
  const recordedRequests: Array<RecordedFetchRequest> = [];

  const fixtureFetch = (
    requestInput: string | URL | Request,
    requestInit?: RequestInit,
  ): Promise<Response> => {
    const recordedRequest: RecordedFetchRequest = {
      url: requestInput instanceof Request ? requestInput.url : String(requestInput),
      headers: new Headers(requestInit?.headers),
      body: requestBodyFrom(requestInit),
      signal: requestInit?.signal ?? null,
      requestOutcome: "pending",
    };
    const responseName = responses[Math.min(recordedRequests.length, responses.length - 1)];
    recordedRequests.push(recordedRequest);
    const { signal } = recordedRequest;

    return new Promise<Response>((resolveResponse, rejectResponse) => {
      if (signal?.aborted === true) {
        recordedRequest.requestOutcome = "aborted";
        rejectResponse(abortError(signal));
        return;
      }
      signal?.addEventListener("abort", () => {
        recordedRequest.requestOutcome = "aborted";
        rejectResponse(abortError(signal));
      });
      if (responseName === undefined || responseName === "hang") {
        return;
      }
      const fixture = loadJevFixture(responseName);
      recordedRequest.requestOutcome = "served";
      resolveResponse(
        new Response(JSON.stringify(fixture.body), {
          status: fixture.status,
          headers: { "content-type": "application/json" },
        }),
      );
    });
  };

  return { fetch: fixtureFetch, recordedRequests };
}
