---
"@krinolabs/krino": patch
---

Add decision providers. `createFakeDecisionProvider` (root entry) gives scripted, offline answers with configurable latency, timeout simulation, error injection and recorded calls; `createKrino` now uses it by default, with a warning. `createJevAiGatewayProvider` (`@krinolabs/krino/providers/jev`) asks TypeSafe AI's Jev through Vercel AI Gateway with `experimental_evaluate`, sends all questions in one request, cancels the HTTP request on abort or timeout, and reads its key from `AI_GATEWAY_API_KEY`. It needs the optional peer `ai` (`>=7.0.111 <8`, raised from `>=7.0.0`) and its peer `zod`; the root entry never imports `ai`.
