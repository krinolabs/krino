# @krinolabs/bench

Private workspace package (`"private": true`, never published). It holds the mock tool catalog,
fake executors, and task set that `krino bench` (WP-10) runs against. No network, no clock, and
no randomness: the same input always gives the same output.

## What is in it

| Export | What it is |
|---|---|
| `MOCK_TOOL_CATALOG`, `MOCK_TOOL_NAMES` | 100 tools: 10 domains × 10 tools. Each domain has 2–3 look-alike tools (`lookAlikeOf`) whose descriptions say when *not* to use them. |
| `findMockTool`, `hasMockTool`, `toToolDescriptions` | Lookups by name (backed by a `Map`), and the catalog as krino `ToolDescription`s. |
| `executeMockTool(toolName, input)` | Fake executor. Validates the input, then returns the tool's fixed JSON, the parsed input, and a digest of the input. Never throws: an unknown tool or bad input gives `executionStatus: "failed"`. |
| `BENCH_TASKS` | 60 tasks: 20 `easy`, 20 `lookAlike`, 20 `multiStep`, each with a stable `taskIdentifier` and `expectedToolNames` in call order. |
| `estimateCatalogSize`, `reportDomainNoteShare` | Token estimate (characters ÷ 4) and how much of each description is shared domain-note text. |
| `composeToolDescription`, `buildParametersSection` | Build a description from its core text, the generated `Parameters:` section, and the domain note. |

Domains: orders, refunds, shipping, coupons, customers, inventory, payments, returns,
support tickets, logs.

## Task IDs

Task IDs are stable; never reuse or renumber an id. Each task in `src/tasks/bench-tasks.ts`
carries a literal `taskIdentifier` (`task-NNN`); none is derived from its position, so reordering
the list changes nothing. A new task takes the next unused number. The id → `expectedToolNames`
snapshot in `src/tasks/__snapshots__/` makes any change to a task's meaning show up in review.

## Hosts

### Vercel AI SDK (`@krinolabs/bench/ai-sdk`)

```ts
import { createAiSdkToolSet } from "@krinolabs/bench/ai-sdk";

const tools = createAiSdkToolSet(); // ToolSet of tool({ description, inputSchema, execute })
```

### Claude Agent SDK (`@krinolabs/bench/claude-agent-sdk`)

```ts
import { MOCK_TOOL_NAMES } from "@krinolabs/bench";
import {
  BENCH_MCP_SERVER_NAME,
  toAgentSdkMcpServer,
  toClaudeAgentSdkToolName,
} from "@krinolabs/bench/claude-agent-sdk";

const benchServer = toAgentSdkMcpServer(MOCK_TOOL_NAMES, { loadAllTools: true });
// query({ prompt, options: { mcpServers: { [BENCH_MCP_SERVER_NAME]: benchServer },
//   allowedTools: MOCK_TOOL_NAMES.map(toClaudeAgentSdkToolName) } })
```

`toAgentSdkMcpServer(toolNames, options)` builds an in-process MCP server (`createSdkMcpServer`)
that serves the named tools, in the given order. Repeated names are served once. A name that is
not in the catalog throws when you build the server, so a typo fails at setup, not mid-run. Tool
names in the Agent SDK are `mcp__krino-bench__<tool>`.

#### `loadAllTools`

| Value | Effect |
|---|---|
| `true` (default) | Sets the Agent SDK's `alwaysLoad` on the server: every tool stays in the prompt and is never deferred behind tool search. The model sees the full list, as the AI SDK host sends it, so the two hosts are compared on the same prompt. |
| `false` | The Agent SDK default: when tool search is on, tools may be deferred and loaded on demand. Use it to compare krino's run-start selection with the SDK's own tool search. |

Verified against `@anthropic-ai/claude-agent-sdk` 0.3.286.

## Tool descriptions

Each description is built from three parts, separated by blank lines
(`composeToolDescription` in `src/catalog/tool-description.ts`):

1. **Core description** (`coreDescription`), written per tool: what it does and when to use it.
   Look-alikes also say when *not* to use it and which tool to use instead.
2. **`Parameters:` section**, generated from the tool's own Zod input schema (through the JSON
   Schema the model receives): one line per field with name, type, required or optional, allowed
   values, and the field's `.describe()` text. It cannot drift from the schema.
3. **Domain note** (`domainNote`): a short line with facts that hold for every tool in the domain
   (ID formats, units, rate limits). It names no parameters.

Example (`issue_store_credit`):

```
Adds store credit to a customer account that they can spend on future orders. No money goes back
to a card. Do not use it when the customer asks for money back to their original payment method;
use create_refund for that.

Parameters:
- customerId (string, required): Customer identifier, for example CUS-5531.
- amountInCents (integer, required): Credit amount in the account currency, in cents.
- creditReason (string, required): Short reason shown on the customer's credit history.

Refunds API: amounts are integer cents; refund IDs are RF- plus digits. Max 20 calls per minute.
```

Tests that guard this:

- Every camelCase identifier in a description (such as `customerId`) must be a field name or an
  allowed value in that tool's own input schema, so docs cannot name a parameter the tool does not
  take.
- Every schema field has `.describe()` text.
- No two domains share a domain note, or even one sentence of one; notes contain no parameter names
  and no camelCase identifiers.
- Shared domain-note text is at most 35% of an average description (`reportDomainNoteShare()`).

## Catalog size

The full catalog is about **18,700 tokens** (characters ÷ 4 of `name`, `description`, and the
JSON Schema the AI SDK sends). A test keeps it between 15,000 and 20,000. Shared domain-note text
averages about 25% of a description. If the total ever drops below 15,000, lengthen the core
descriptions with tool-specific detail; do not add shared text.

## Scoring

`krino-bench` (WP-10, `bench-runner/`) scores each run with these metrics, for every setup
(`baseline`, `per-step`, `step-zero`). Report each one overall, per difficulty (`easy`,
`lookAlike`, `multiStep`), and per stable task identifier (never by position).

### Selection recall (primary): recall at the step the tool was needed

The share of runs where **every** expected tool was offered on the step where the agent called it,
or would have called it.

```
selectionRecall = count(runs where every expected tool was offered on its needed step) / count(runs)
```

Walk `expectedToolNames` in order:

- an expected tool the agent called (its first call after the previous expected tool's match) is
  needed on the step of that call;
- an expected tool it never called is needed on the step after the previous expected tool's step
  (step 0 for the first one).

The tool must be in the list sent on that step. A run that ends before that step misses the tool.
Missing even one expected tool fails the run: the agent cannot call a tool it was not given. This
works for every setup, including `per-step`, whose list changes from step to step. For
`step-zero` the list never changes, so it equals step-0 recall whenever the run reaches each needed
step; it can only be lower when the agent itself stops early.

### Step-0 recall (secondary)

The share of runs where every expected tool is in the set sent on step 0:

```
stepZeroSelectionRecall = count(runs where expectedToolNames ⊆ stepZeroToolNames) / count(runs)
```

`stepZeroToolNames` is the set krino keeps at step 0 (AI SDK) or at run start (Claude Agent SDK).

Comparisons use exact tool names; a name that is not in the catalog never matches.

### Set size

The number of tools kept versus the number available.

```
keptShare = count(stepZeroToolNames) / count(availableToolNames)
```

Report the mean and the median of `keptShare` over runs, and the mean kept count. `available` is
the run's tool count (`--tool-counts`; 100 for the full catalog). A smaller set is only better at the same selection recall, so always
read set size next to selection recall.

### Sequence match (multiStep only)

Only for the 20 `multiStep` tasks; `easy` and `lookAlike` tasks have one expected tool and are not
scored on sequence. A task matches when `expectedToolNames` appears **in order** in the tools the
agent actually called. Other calls may come in between (for example an extra lookup), but the
expected tools must keep their order.

```
sequenceMatch = count(multiStep tasks where expectedToolNames is an ordered subsequence of calledToolNames)
              / count(multiStep tasks)
```

#### Extra calls (per multiStep task)

For every `multiStep` task, also report how many calls were not part of the expected sequence.
Walk `calledToolNames` left to right and match each expected tool, in order, to its first call
after the previous match:

```
extraCallCount = count(calledToolNames) − count(expected tools matched in order)
```

A repeated call to an expected tool counts as extra. For a matched task this is
`count(calledToolNames) − count(expectedToolNames)`; for an unmatched task it counts every call
that was not matched to an expected tool. Report it per task (task identifier, `extraCallCount`, matched or
not) and as a mean over the 20 multiStep tasks.

## Scripts

`pnpm --filter @krinolabs/bench <script>`: `build` (tsup), `typecheck`, `lint`, `test`.
Tests run with `../tooling/vitest/trace-isolation.ts` in `setupFiles` (see `vitest.config.ts`),
so they never write traces under the real `~/.krino`.
