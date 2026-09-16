# elysia-backend

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.10. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## AI workflow startup

Send an authenticated request to `POST /ai/analyze`. The `user_id` must match the user in the bearer token.

```bash
curl http://localhost:3000/ai/analyze \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Check this cereal", "user_id":21}'
```

The VoltAgent workflow initializes an execution, runs the existing Bodyguard assessment, then asks Conductor to extract intent and propose steps. Only `safe: true` with `action: allow` reaches Conductor planning. Proposed specialists are not executed yet.

The response is `{ data: { execution_id, status, product, assessments, alternatives, explanation, sources, limitations } }`. The Conductor schema describes the final aggregate after the selected agents finish. Planning (`intent` and proposed `steps`) and the Bodyguard decision remain internal workflow state. Until the analysis agents are implemented, `product` and `explanation` are null and `assessments`, `alternatives`, and `sources` are empty. Allowed requests return `partial`; rejected requests return `blocked` or `needs_review`. Provider failures, invalid model output and cancellation return `error`. Startup has a shared 45-second deadline.

Set `GOOGLE_GENERATIVE_AI_API_KEY` once. Both agents use the shared provider in `src/ai/provider.ai.ts`; `AI_BODYGUARD_MODEL` and `AI_CONDUCTOR_MODEL` independently select their models. Both default to the existing `gemini-3.5-flash-lite` model. Importing the AI entrypoint does not request terminal input or call Google.

Run the focused tests with `bun test src/module/main/ai`. These tests use stubbed agent responses and make no Google requests.
