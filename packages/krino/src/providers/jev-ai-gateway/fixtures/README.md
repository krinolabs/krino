# Jev fixtures

Sanitized AI Gateway `POST /v4/ai/evaluation-model` response bodies, served by a fake
`fetch` in unit tests. No test touches the network.

- Shape: `@ai-sdk/gateway` 4.0.102 `gatewayEvaluationResponseSchema` (used by `ai` 7.0.126).
- No prompts, task text, API keys or generation IDs. Free-form strings are `[redacted]`.
- `source` says where each file came from. `schema` files were written from the SDK schema,
  not recorded. Replace them with recorded ones by running the live smoke with
  `KRINO_RECORD_FIXTURES=1` (it writes through `sanitizeJevResponseBody`), then review the diff.
