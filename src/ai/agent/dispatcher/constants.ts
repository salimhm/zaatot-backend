const enum_dispatcher_agent = [
  'Detective',
  'Vault Keeper',
  'Medic',
  'Investigator',
  'Eco Scout',
  'Historian',
  'Skeptic',
  'Referee',
  'Coach',
  'Bargain Hunter',
  'Storyteller',
  'Gatekeeper',
] as const

const enum_dispatcher_check = [
  'identity',
  'personal_context',
  'clinical_risk',
  'ethics',
  'environment',
  'history',
  'evidence',
  'hard_constraints',
  'goal_fit',
  'alternatives',
  'final_response',
] as const

const dispatcher_budget_limit = {
  timeout_ms: 60_000,
  max_tool_calls: 20,
  max_retries: 1,
  max_alternative_candidates: 3,
  max_candidate_review_passes: 1,
  max_response_repairs: 1,
} as const

export { enum_dispatcher_agent, enum_dispatcher_check, dispatcher_budget_limit }
