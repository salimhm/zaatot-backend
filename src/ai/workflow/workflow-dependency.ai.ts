import type { type_schema_agent_dispatcher_input } from '@agent/dispatcher/dispatcher.schema.agent'
import type { consumer_execution_dependency } from '@ai/execution/execution-contract.ai'

import { adapter_detective } from '@ai/adapter/detective.adapter.ai'
import { adapter_investigator } from '@ai/adapter/investigator.adapter.ai'
import { adapter_medic } from '@ai/adapter/medic.adapter.ai'
import { adapter_bodyguard, adapter_conductor, adapter_dispatcher } from '@ai/adapter/planning.adapter.ai'
import { adapter_skeptic } from '@ai/adapter/skeptic.adapter.ai'
import { adapter_vault_keeper } from '@ai/adapter/vault-keeper.adapter.ai'
import { inspect_external_content } from '@agent/bait-tester/bait-tester.agent'

export type consumer_dependency = consumer_execution_dependency & {
  bodyguard: (prompt: string, signal: AbortSignal) => Promise<unknown>
  conductor: (prompt: string, signal: AbortSignal) => Promise<unknown>
  dispatcher: (input: type_schema_agent_dispatcher_input, signal: AbortSignal) => Promise<unknown>
}

// The agents connected to each workflow slot. Tests inject their own dependency instead.
export const default_dependency: consumer_dependency = {
  bodyguard: adapter_bodyguard,
  conductor: adapter_conductor,
  dispatcher: adapter_dispatcher,
  // Replace each null with an adapter: async (input, signal) => ({ status, output, limitations }).
  // Validate the real agent's output in the adapter. See docs/workflow-placeholders.md.
  specialists: {
    Detective: adapter_detective,
    'Vault Keeper': adapter_vault_keeper,
    Medic: adapter_medic,
    Investigator: adapter_investigator,
    'Eco Scout': null, // TODO: agent_eco_scout — environmental evidence.
    Historian: null, // TODO: agent_historian — permitted history only.
    Skeptic: adapter_skeptic,
    Referee: null, // TODO: agent_referee — hard constraints.
    Coach: null, // TODO: agent_coach — permitted goal fit.
    'Bargain Hunter': null, // TODO: agent_bargain_hunter — alternative candidates.
    Storyteller: null, // TODO: agent_storyteller — draft / repair the explanation.
    Gatekeeper: null, // TODO: agent_gatekeeper — output the validated final API response.
  },
  candidate_review: null, // TODO: bounded candidate identity / specialist / evidence / constraint review.
  bait_tester: inspect_external_content,
}
