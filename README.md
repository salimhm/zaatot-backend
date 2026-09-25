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

### Temporary workflow UI

While `ENV=dev`, open `http://localhost:3000/ai/test` to exercise the authenticated endpoint from a small browser UI. Enter a JWT and its matching user ID, then submit a product, brand, or barcode query. The token is kept only in page memory.

This is a temporary integration harness, not the production frontend. It requests `text/event-stream` from `/ai/analyze` and displays actual workflow, agent and tool transitions while they execute. Remove the `/ai/test*` routes and `public/ai-test.*` assets when the real frontend integration replaces it.

Clients that send `Accept: application/json` receive the final aggregate with a `steps` array. Clients that send `Accept: text/event-stream` receive `step` events followed by one `result` event containing the same aggregate. These are operational events such as agent and tool transitions; they do not expose private model reasoning.

The VoltAgent workflow initializes an execution, runs Bodyguard, asks Conductor to extract intent, and lets Dispatcher select the work. Only `safe: true` with `action: allow` reaches planning. Connected specialists such as Detective and Investigator execute in dependency order; unimplemented specialists are ignored rather than blocking this temporary workflow.

The response is `{ data: { execution_id, status, subject, outcome, product, assessments, alternatives, explanation, sources, limitations, steps } }`. Planning data and the Bodyguard decision remain internal; `steps` contains safe operational progress events, not agent prompts or hidden reasoning. Rejected requests return `blocked` or `needs_review`. Provider failures, invalid model output and cancellation return `error`. The shared deadline is configured by `AI_WORKFLOW_TIMEOUT_MS` and currently defaults to 240 seconds.

Set `GOOGLE_GENERATIVE_AI_API_KEY` once. Both agents use the shared provider in `src/ai/provider.ai.ts`; `AI_BODYGUARD_MODEL` and `AI_CONDUCTOR_MODEL` independently select their models. Both default to the existing `gemini-3.5-flash-lite` model. Importing the AI entrypoint does not request terminal input or call Google.

Run the focused tests with `bun test src/module/main/ai`. These tests use stubbed agent responses and make no Google requests.
