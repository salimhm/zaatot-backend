## Request

Send `Authorization: Bearer <your existing JWT>` and `Content-Type: application/json`.

```json
{
  "message": "Check this product",
  "barcode": "3017620422003",
  "checks": ["nutrition", "ethics", "environment"],
  "consent": {
    "personalization": false,
    "history": false
  }
}
```

A barcode is preferred. Alternatively provide `product_name`, or let Detective extract an
explicit identifier from the message. Ambiguous names return `needs_input` with inspected
candidates. This endpoint accepts text and identifiers; it does not fetch arbitrary URLs
or process uploaded images.

Supported checks are `nutrition`, `ethics`, `environment`, `history`, `fit`,
and `alternatives`. The first three run by default. Up to three
`alternative_barcodes` can be supplied. Alternatives automatically require nutrition,
ethics and environmental review. Identity and user IDs cannot be overridden in the body.

## Execution

1. The controller verifies the JWT signature, expiry, Bearer scheme and user claims.
   Conductor validates input and identity again, then applies the per-user rate limit.
2. Bodyguard Check whether the request is allowed. The Bodyguard blocks forbidden requests before they reach external services or stored private information.
3. The Dispatcher chooses which checks are needed and sets strict limits on resources.
4. The Detective confirms the product’s identity. The Vault Keeper retrieves only information you’re allowed to use. The Bait Tester examines outside content in isolation, without access to tools or private information.
5. Run specialist checks together. The Medic, Investigator, Eco Scout, and Historian examine their assigned areas at the same time.
6. Check the evidence and enforce rules: The Skeptic checks that supporting evidence is valid and current. The Referee applies restrictions. Missing or unresolved required checks stay marked needs_review—they don’t count as a pass.
7. Coach computes supported goal-fit scores only after hard checks pass.
8. Look for alternatives. The Bargain Hunter examines comparable products and puts them through the same specialist checks, review, and scoring.
9. Build the explanation from approved facts. The Storyteller chooses the order of approved claims. The backend inserts their exact wording, preventing the model from adding unsupported facts or changing restrictions.
10. Gatekeeper rechecks consent, validates citations and privacy, and validates the final schema.
    The controller sends `{ "data": execution.result }`.

Bodyguard, Detective query extraction, Bait Tester and Storyteller are Gemini-backed
VoltAgent agents with role-specific prompts, structured outputs, no tools, no conversational
memory and no model retries. The other roles use deterministic code and scoped service calls,
matching the implementation classes in the supplied role table.

## Store A and consent

Vault Keeper uses the existing private user database tables `product_fit_profile`
and `product_fit_consent` through `service_product_fit_vault.find`.

- Request flags express permission to use the corresponding stored grant; they do not create consent.
- Personalization requires the latest `personalized_product_fit` consent to be granted,
  effective, unexpired, not withdrawn and not deleted.
- The grant must reference the exact active profile ID and version. Superseded/deleted profiles are denied.
- History additionally requires an active `product_fit_history` grant and explicit request history consent.
- The JWT must include the user's own `user` tenant membership.
- Only required profile fields are selected. Raw profiles, consent hashes and user IDs are not returned.
- Consent is re-read before returning personalized findings. Changed or unverifiable consent discards those findings.

These purpose codes are the runtime contract used by the new reader; existing consent writers
must use matching purposes. No profile/consent writer or database migration is run by the workflow.

Supported scoring goals are `lower_processing`, `better_nutriscore`, and
`better_ecoscore`. `avoid_boycott` is enforced as an ethical restriction rather
than assigned an invented numeric score. Unknown goals, diet certification requirements,
incomplete allergen data and unverifiable freshness remain explicit limitations.
An unrecognized stored ethics policy prevents personalized scoring until its policy mapping is implemented.

## Response

`data` contains `execution_id`, `status`, `product`, `candidates`, `assessments`,
`fit`, `review`, `alternatives`, `explanation`, `sources`, `limitations` and a compact role `trace`.
`review` records the Referee decision, hard constraints and conflicting considerations.

Business statuses are `completed`, `partial`, `blocked`, `needs_input`,
`needs_review` and `error`. They describe analysis outcomes, not JWT status.
Invalid authentication returns HTTP 401; malformed requests return 400/422;
rate/concurrency limits return 429. Business outcomes return a validated JSON response.

## Budgets and configuration

- `GOOGLE_GENERATIVE_AI_API_KEY`: existing Gemini credential.
- `DEFAULT_AI_MODEL_NAME`: configured model; fallback is the project's existing `gemini-3.5-flash-lite`.
- `AI_WORKFLOW_TIMEOUT_MS`: defaults to 45000, capped at 50000.
- `AI_SOURCE_MAX_AGE_DAYS`: defaults to 30.
- `AI_RATE_LIMIT_PER_MINUTE`: defaults to 6 per authenticated user.
- At most 12 model calls, 20 provider-adapter calls and 3 alternative candidates per request.
- At most 2 in-flight runs per user and 8 per server process.

A provider-adapter call may contain multiple bounded service reads.
Caller cancellation and deadlines abort model work and stop subsequent steps.
Existing database/provider reads without cancellation support may finish in the background;
this workflow performs no catalog, history or decision writes.
Set the HTTP idle timeout above the workflow deadline.

## Evidence coverage

Product cache/Open Food Facts, Boycat/local boycott evidence and consented scan history
are connected. Full ownership graphs, verified clinical rule sets, live prices, independent
environmental measurements and category equivalence are not supplied by the current services.
Missing evidence is never manufactured. Alternative suggestions are bounded catalog comparisons,
not guarantees of medical safety, ethical clearance, equivalent composition or lower price.
