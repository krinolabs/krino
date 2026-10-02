# ADR-018: Tool selection asks one yes/no question per tool, in one request

## Status

Proposed (2026-10-02). Source: the WP-03 live smoke test, `packages/krino/scripts/smoke-jev.ts`
(billing check). Becomes Accepted or Rejected once the result below is recorded.

## Context

Tool selection must turn "which tools does this step need?" into questions a decision provider
can answer with a probability. The Jev provider sends every question in one AI Gateway request
that shares one state (task, recent messages, tool list). If the provider bills that shared
state once per request, many small questions are cheap. If it bills the state once per question,
cost grows with the number of tools, and a 40-tool agent pays for the same context 40 times.

## Decision

Ask one yes/no question per available tool ("Does the agent need the tool X to complete this
task?"), all in one request with the shared state. A tool is selected when the answer is "yes".
The selection's probability is the weakest answer's probability. This is the shape
`buildToolSelectionQuestions` builds today.

This decision holds only if the smoke test shows the shared state is billed once per request.

## Alternatives rejected

- One choice question whose options are candidate tool sets (encoded with
  `encodeToolNameChoice`): the number of sets grows exponentially with the tool count, so krino
  would have to pre-select candidates without the model.
- One request per tool: pays the shared state and request latency once per tool.

## Consequences

- Each tool gets its own probability, so a single unsure tool lowers the whole selection's
  confidence and tool selection fails open to all tools.
- Cost depends on the billing result below. If the state is billed per question, revisit this
  ADR before WP-06 and WP-07 enforce tool selection.

## Result pending

Not yet recorded. To fill in, run the billing check with a real key:

```text
KRINO_LIVE=1 pnpm --filter @krinolabs/krino smoke:jev
```

Then paste its billing table here (questions, input tokens, output tokens, cost, latency for
1 and 20 questions on the same shared context), with the verdict "billed once per request" or
"billed once per question", and change the status.
