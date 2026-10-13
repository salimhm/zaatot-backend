import type { consumer_backend_context } from '@ai/execution/execution-contract.ai'
import type { ai_tool_activity } from '@ai/runtime.ai'

import { createTool } from '@voltagent/core'

import { lib_tool_own_user_payload, lib_tool_signal } from '@tool/utils.tool'
import { dto_tool_vault_keeper_context } from '@tool/vault-keeper/vault-keeper-context.dto.tool'

import { service_product_fit_vault } from '@module/user/product-fit-vault/product-fit-vault.service'

export type vault_keeper_context_runtime = {
  use_tool: <T>(call: () => Promise<T>, activity: ai_tool_activity) => Promise<T>
}

export type vault_keeper_context_dependency = Pick<typeof service_product_fit_vault, 'find'>

const tool_activity: ai_tool_activity = {
  name: 'tool_vault_keeper_context',
  title: 'Retrieving permitted private context',
}

/**
 * Creates the per-request private-context tool. Its identity is captured from
 * verified server context, never from model-controlled tool arguments.
 */
export const tool_vault_keeper_context = (
  backend_context: consumer_backend_context,
  runtime?: vault_keeper_context_runtime,
  dependency: vault_keeper_context_dependency = service_product_fit_vault,
) => {
  const payload = lib_tool_own_user_payload(backend_context)

  return createTool({
    name: 'tool_vault_keeper_context',
    description:
      'Retrieve only the current request’s consent-permitted product-fit profile and history permission. Never accepts a user ID or accesses another user.',
    parameters: dto_tool_vault_keeper_context.read,
    outputSchema: dto_tool_vault_keeper_context.result,
    execute: async (args, options) => {
      const query = dto_tool_vault_keeper_context.read.parse(args)
      const signal = lib_tool_signal(options)
      signal?.throwIfAborted()

      const read = () => dependency.find(query, payload)
      const result = runtime ? await runtime.use_tool(read, tool_activity) : await read()

      signal?.throwIfAborted()
      return dto_tool_vault_keeper_context.result.parse({
        permissions: {
          personalization: query.personalization && result.profile !== null,
          history: query.history && result.history_allowed,
        },
        profile: query.personalization ? result.profile : null,
      })
    },
  })
}

// The alias makes the per-request construction explicit at call sites.
export const create_vault_keeper_context_tool = tool_vault_keeper_context
