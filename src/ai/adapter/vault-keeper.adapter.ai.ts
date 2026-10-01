import type { consumer_backend_context, consumer_specialist_input } from '@ai/execution/execution-contract.ai'

import { dto_tool_vault_keeper_context } from '@tool/vault-keeper/vault-keeper-context.dto.tool'
import { create_vault_keeper_context_tool } from '@tool/vault-keeper/vault-keeper-context.tool'

// Deterministic adapter: retrieves only consented, minimized context. No model call.
export const adapter_vault_keeper = async (input: consumer_specialist_input, signal: AbortSignal, backend_context?: consumer_backend_context) => {
  if (!backend_context) {
    const missing_information = ['Verified authentication context is required to retrieve private product-fit context.']
    return {
      status: 'blocked' as const,
      output: { profile: null, missing_information },
      permissions: { personalization: false, history: false },
      limitations: missing_information,
    }
  }

  const tool = create_vault_keeper_context_tool(backend_context, { use_tool: input.use_tool })
  const context = dto_tool_vault_keeper_context.result.parse(
    await tool.execute!({ personalization: true, history: true }, { toolContext: { abortSignal: signal } as never }),
  )
  const missing_information = [
    ...(context.permissions.personalization ? [] : ['A consented product-fit profile is unavailable for this request.']),
    ...(context.permissions.history ? [] : ['Permission to use product-fit history is unavailable for this request.']),
  ]

  return {
    status: 'completed' as const,
    output: { profile: context.profile, missing_information },
    permissions: context.permissions,
    limitations: missing_information,
  }
}
