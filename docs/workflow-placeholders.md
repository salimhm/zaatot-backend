# Connecting the remaining agents

The stage order is wired in `src/ai/workflow.ai.ts`. Detective is connected to the existing `agent_product_brand_lookup` wrapper. Replace the remaining `null` entries in `default_dependency.specialists` as you implement agents. Keep their execution order in the chain.

Detective builds and validates `{ query_type, found, sources_checked, products, brands, message }` from lookup tool results. One matching product or brand completes its step; missing or ambiguous matches return `needs_input`. It retains the lookup agent's existing Groq configuration and tools. The workflow supplies its cancellation signal and wraps each lookup tool call in the shared tool budget. Successful Open Food Facts results require the Bait Tester callback before their text reaches the model; that callback is still a placeholder.

The Groq lookup call uses ordinary text output while calling tools. The backend normalizes and validates the returned tool records instead of using the model's final text as the factual payload. Do not add `Output.object(...)` to this tool-enabled call: [Groq does not support structured outputs together with tool use](https://console.groq.com/docs/structured-outputs).

With Detective connected and later agents still missing, a successful lookup normally produces public `needs_review`. The final API result keeps analysis fields empty until final review. Detective's unreviewed message remains inside the workflow.

```text
Bodyguard → Conductor plan → Dispatcher plan
  → [Detective | selected Vault Keeper] → merge
  → [selected Medic | Investigator | Eco Scout | Historian] → merge
  → Skeptic → Referee → selected Coach → selected Bargain Hunter
  → candidate review → Storyteller → Gatekeeper → bounded repair
  → conductor-result
```

The two bracketed stages use `.andAll()`. Each branch returns its own updates; the merge steps preserve the original request and every branch result. Agent callbacks run only when selected and when all their dependencies have returned `completed`. Missing or restrictive prerequisites prevent downstream analysis. A configuration with every specialist slot empty makes no specialist AI calls and returns `partial`, with unresolved work listed in `limitations`.

## An adapter slot

Every slot has the signature `(input, signal) => Promise<consumer_step_result>`. Its envelope is `{ status, output, limitations }`. This is a workflow adapter contract, separate from each agent's own schema.

Detective's current adapter follows this pattern:

```ts
Detective: async (input, signal) => {
  const result = await agent_product_brand_lookup(input.prompt, signal, {
    use_tool: input.use_tool,
    inspect_content: input.inspect_content,
  })
  if (!result.success) throw new Error('Detective failed', { cause: result.data })

  const output = schema_agent_product_brand_lookup.parse(result.data)
  const resolved = output.found && output.query_type !== 'unknown'
  return {
    status: resolved ? 'completed' : 'needs_input',
    output,
    limitations: resolved ? [] : ['Detective could not resolve the product or brand. Provide a more specific name or barcode.'],
  }
},
```

Do not translate `{ success: true }` automatically to `completed`: a successful model call can still report ambiguity, a restriction, or missing evidence. Map those results to `needs_input`, `blocked`, `needs_review`, or `partial` as appropriate. Exceptions receive bounded retries; exhausted attempts leave the check unresolved.

## Inputs and permissions

- `input.dependencies` contains the required agents' workflow envelopes. For example, Medic reads `input.dependencies.Detective?.output` and, when selected, `input.dependencies['Vault Keeper']?.output`.
- Only Vault Keeper receives `input.user_id`. It must verify consent through the appropriate service and return only permitted context.
- Vault Keeper may additionally return `permissions: { personalization: boolean, history: boolean }`, based on that verified consent. Missing permission defaults to denied. Other agents cannot grant permission through this field.
- Coach requires personalization permission; Historian requires history permission. A skipped check remains unresolved.
- Pass only the relevant fields to each model rather than serializing the whole adapter input (which also contains runtime functions).

## Shared budgets and external content

- Always pass the provided `signal` to the agent and its I/O. It combines the outer workflow deadline with the remaining Dispatcher budget.
- Wrap **each actual tool call** in `input.use_tool(() => actual_tool_call())`. The shared counter also covers parallel agents, retries, candidate reviews, and repairs. A future agent with internal tools must integrate this wrapper at its tool execution boundary; wrapping the entire agent call counts only once and is insufficient.
- Before sending external free text to an agent, call `input.inspect_content(text)`. This invokes `default_dependency.bait_tester` with only text and the signal. An empty or rejecting Bait Tester slot prevents consumption. Returned evidence still needs Skeptic review.
- `input.budgets` is a snapshot of the remaining allowance. `use_tool` and the signal enforce shared runtime limits.

## Alternatives and final approval

`default_dependency.candidate_review` is a separate placeholder after Bargain Hunter. Its future implementation must cap candidates using `max_alternative_candidates`, cap review passes using `max_candidate_review_passes`, and rerun identity, applicable specialists, Skeptic, Referee, and permitted Coach checks for each candidate. It receives the completed results as context and the same budget helpers. This domain-specific review remains a placeholder until candidate schemas and adapters exist; alternatives cannot reach Storyteller while it is missing or incomplete.

Storyteller receives the approved candidate review through `input.candidate_review`. Its normal dependencies contain the reviewed primary findings.

The Gatekeeper adapter must return the **complete eight-field API response** as `output` only after schema, privacy, citations, required checks, and hard constraints are approved. `conductor-result` validates that response against `schema_agent_conductor_result` and preserves the real execution ID. Intermediate model output is not copied directly to the public response.

If Gatekeeper returns `repair_required`, the workflow calls Storyteller again with `input.feedback`, then reruns Gatekeeper. All repairs share the same budgets and stop at `max_response_repairs`. Exhaustion produces a minimal error response.

Connecting only some agents keeps the result restrictive (`needs_review`, `needs_input`, or `blocked`, depending on the outcome). A placeholder or skipped gate never counts as successful validation.
