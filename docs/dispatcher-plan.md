
Always required       Requested specialists
──────────────────    ─────────────────────
Detective             Vault Keeper
Skeptic               Medic
Referee               Eco Scout
Storyteller           Coach
Gatekeeper            investigator

# Dispatcher contract

Dispatcher proposes which agents should run, their prerequisites, conditions, mandatory checks and bounded resource use. It produces an internal execution plan, not product findings or the final Conductor response.

The agent in `src/ai/agent/dispatcher/` is connected to `workflow.ai.ts` as the `dispatcher-plan` step after `conductor-plan`. It runs only after Bodyguard approval and successful Conductor planning. The validated plan is carried internally as `dispatcher_plan`. Later stages are now wired with replaceable agent slots; the default slots remain empty and the API returns an eight-field `partial` result. See [workflow-placeholders.md](workflow-placeholders.md) for the adapter contract and replacement locations.

## Inputs

Call `agent_dispatcher(input, signal)` with:

- `prompt`: the current request, treated as untrusted data.
- `bodyguard`: the validated decision; only `safe: true` and `action: allow` are accepted.
- `conductor_plan`: optional planning context, treated as an advisory proposal.
- `budget_limits`: remaining server-controlled limits after earlier steps. The caller must calculate the remaining deadline rather than restart it.

The planner receives no raw user profile. Saved goals, restrictions and preferences must be retrieved through Vault Keeper after consent checks. Prompt text can request personal analysis, but it cannot grant access to the private database.

## Example plan

For “give me info about coca cola”, a minimal plan could be:

```json
{
  "selected_agents": [
    {
      "agent": "Detective",
      "depends_on": [],
      "run_when": "always"
    },
    {
      "agent": "Skeptic",
      "depends_on": [
        "Detective"
      ],
      "run_when": "always"
    },
    {
      "agent": "Referee",
      "depends_on": [
        "Skeptic"
      ],
      "run_when": "always"
    },
    {
      "agent": "Storyteller",
      "depends_on": [
        "Skeptic",
        "Referee"
      ],
      "run_when": "always"
    },
    {
      "agent": "Gatekeeper",
      "depends_on": [
        "Storyteller"
      ],
      "run_when": "always"
    }
  ],
  "required_checks": [
    "identity",
    "evidence",
    "hard_constraints",
    "final_response"
  ],
  "budgets": {
    "timeout_ms": 30000,
    "max_tool_calls": 8,
    "max_retries": 0,
    "max_alternative_candidates": 0,
    "max_candidate_review_passes": 0,
    "max_response_repairs": 1
  },
  "untrusted_content_policy": "bait_tester_before_consumption",
  "candidate_validation": "not_requested"
}
```

For an ethics request, add Investigator after Detective, include `ethics`, and make Skeptic also depend on Investigator. Other specialist checks follow the same dependency rules in the prompt.

Detective and Vault Keeper may run in parallel. Independent specialists may run in parallel after their prerequisites finish. Referee must wait for Skeptic. Coach requires Vault Keeper and Referee, and `personalization_permitted`; Historian requires Vault Keeper and `history_permitted`.

Bait Tester is invoked before consuming untrusted external text wherever it appears. It is represented by `untrusted_content_policy`, rather than a single linear step that could run too late.

Alternatives require `repeat_required_checks`: resolve each candidate, rerun applicable specialist checks, Skeptic, Referee and Coach when selected. Candidate reviews share the global deadline and tool budget.

## Deterministic enforcement

Zod rejects missing gates, duplicate agents, invalid dependencies, mismatched checks, incorrect personal-data conditions and invalid alternative-review settings. The agent wrapper rejects plans exceeding the supplied remaining limits and subtracts planning time from the remaining timeout.

Maximums in `dispatcher_budget_limit` are 60 seconds, 20 tool calls, 1 retry per step, 3 alternative candidates, 1 review pass per candidate and 1 final response repair. The workflow currently defaults to 60 seconds overall and supplies only the remaining time after earlier steps, capped at the Dispatcher maximum. These are configurable code policy choices for this scaffold, not provider limits.

The executor checks which adapters are connected, prerequisites and permission flags, merges parallel results, and preserves unresolved checks. Adapters share deadline, tool-budget and content-inspection helpers. Actual agent schemas, consent retrieval, per-tool integration and the bounded candidate-review adapter still need implementation. A validated plan does not mean the analysis has run.
