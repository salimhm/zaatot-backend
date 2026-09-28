import type { consumer_specialist_input } from '@ai/execution.ai'
import type { vault_keeper_context_runtime } from '@tool/vault-keeper/vault-keeper-context.tool'

import { describe, expect, it, mock, spyOn } from 'bun:test'

import { adapter_vault_keeper } from '@ai/workflow.ai'
import { create_vault_keeper_context_tool } from '@tool/vault-keeper/vault-keeper-context.tool'

import { lib_error } from '@lib/error.lib'

import { service_product_fit_vault } from '@module/user/product-fit-vault/product-fit-vault.service'

const backend_context = {
  payload: {
    user_id: 7,
    tenants: [
      { tenant_id: 7, tenant_type: 'user' as const, tenant_schema_version: 'user-schema-v1' },
      { tenant_id: 33, tenant_type: 'organization' as const, tenant_schema_version: 'organization-schema-v1' },
    ],
  },
}

const adapter_input = (use_tool: consumer_specialist_input['use_tool']): consumer_specialist_input => ({
  prompt: 'Check this product',
  execution_id: 'vault-keeper-test',
  dependencies: {},
  candidate_review: null,
  budgets: {
    timeout_ms: 1_000,
    max_tool_calls: 8,
    max_retries: 0,
    max_alternative_candidates: 0,
    max_candidate_review_passes: 0,
    max_response_repairs: 0,
  },
  use_tool,
  inspect_content: async (text) => text,
})

describe('Vault Keeper context tool', () => {
  it('connects Vault Keeper with permitted context, permission flags, and missing information', async () => {
    const find = spyOn(service_product_fit_vault, 'find').mockResolvedValue({
      version: 'private-version',
      profile: { goals: ['lower_sugar'], allergens: [], avoided_ingredients: [], diets: [] },
      history_allowed: false,
    })
    const activity: unknown[] = []
    try {
      const result = await adapter_vault_keeper(
        adapter_input(async (call, metadata) => {
          activity.push(metadata)
          return await call()
        }),
        new AbortController().signal,
        backend_context,
      )

      expect(result).toEqual({
        status: 'completed',
        output: {
          profile: { goals: ['lower_sugar'], allergens: [], avoided_ingredients: [], diets: [] },
          missing_information: ['Permission to use product-fit history is unavailable for this request.'],
        },
        permissions: { personalization: true, history: false },
        limitations: ['Permission to use product-fit history is unavailable for this request.'],
      })
      expect(activity).toEqual([{ name: 'tool_vault_keeper_context', title: 'Retrieving permitted private context' }])
    } finally {
      find.mockRestore()
    }
  })

  it('blocks Vault Keeper when the workflow has no verified backend context', async () => {
    await expect(
      adapter_vault_keeper(
        adapter_input(async (call) => await call()),
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      status: 'blocked',
      output: {
        profile: null,
        missing_information: ['Verified authentication context is required to retrieve private product-fit context.'],
      },
      permissions: { personalization: false, history: false },
      limitations: ['Verified authentication context is required to retrieve private product-fit context.'],
    })
  })

  it('uses only the verified caller context and returns a minimized permitted profile', async () => {
    const find = mock(async () => ({
      version: 'consent-id:1:private-consent-hash:profile-hash',
      profile: {
        goals: ['lower_sugar'],
        allergens: ['milk'],
        avoided_ingredients: ['gelatin'],
        diets: ['vegetarian'],
      },
      history_allowed: true,
    }))
    const activities: unknown[] = []
    let tool_calls = 0
    const use_tool: vault_keeper_context_runtime['use_tool'] = async (call, activity) => {
      tool_calls++
      activities.push(activity)
      return await call()
    }
    const tool = create_vault_keeper_context_tool(backend_context, { use_tool }, { find })

    await expect(tool.execute!({ personalization: true, history: true })).resolves.toEqual({
      permissions: { personalization: true, history: true },
      profile: {
        goals: ['lower_sugar'],
        allergens: ['milk'],
        avoided_ingredients: ['gelatin'],
        diets: ['vegetarian'],
      },
    })
    expect(find).toHaveBeenCalledWith(
      { personalization: true, history: true },
      {
        user_id: 7,
        tenants: [{ tenant_id: 7, tenant_type: 'user', tenant_schema_version: 'user-schema-v1' }],
      },
    )
    expect(tool_calls).toBe(1)
    expect(activities).toEqual([
      {
        name: 'tool_vault_keeper_context',
        title: 'Retrieving permitted private context',
      },
    ])
    expect(JSON.stringify(await tool.execute!({ personalization: true, history: true }))).not.toContain('private-consent-hash')
  })

  it('reports denied scopes without exposing profile or consent metadata', async () => {
    const find = mock(async () => ({ version: 'private-version', profile: null, history_allowed: false }))
    const tool = create_vault_keeper_context_tool(backend_context, undefined, { find })

    await expect(tool.execute!({ personalization: true, history: false })).resolves.toEqual({
      permissions: { personalization: false, history: false },
      profile: null,
    })
  })

  it('does not allow model arguments to select a user or request no scope', async () => {
    const find = mock(async () => ({ version: 'unused', profile: null, history_allowed: false }))
    const tool = create_vault_keeper_context_tool(backend_context, undefined, { find })

    await expect(tool.execute!({ personalization: true, history: false, user_id: 99 } as never)).rejects.toBeInstanceOf(Error)
    await expect(tool.execute!({ personalization: false, history: false })).rejects.toBeInstanceOf(Error)
    expect(find).not.toHaveBeenCalled()
  })

  it('refuses a context without the authenticated user tenant before calling the service', () => {
    const find = mock(async () => ({ version: 'unused', profile: null, history_allowed: false }))

    let caught: unknown
    try {
      create_vault_keeper_context_tool(
        { payload: { user_id: 7, tenants: [{ tenant_id: 8, tenant_type: 'user', tenant_schema_version: 'wrong-user' }] } },
        undefined,
        { find },
      )
    } catch (error) {
      caught = error
    }
    expect(caught).toEqual(lib_error.unauthorized)
    expect(find).not.toHaveBeenCalled()
  })

  it('honors cancellation before and after the private read', async () => {
    const controller = new AbortController()
    controller.abort(new DOMException('Cancelled', 'AbortError'))
    const find = mock(async () => ({ version: 'unused', profile: null, history_allowed: false }))
    const tool = create_vault_keeper_context_tool(backend_context, undefined, { find })

    await expect(
      tool.execute!({ personalization: true, history: false }, { toolContext: { abortSignal: controller.signal } as never }),
    ).rejects.toThrow('Cancelled')
    expect(find).not.toHaveBeenCalled()

    const after = new AbortController()
    const late_find = mock(async () => {
      after.abort(new DOMException('Cancelled after read', 'AbortError'))
      return { version: 'unused', profile: null, history_allowed: false }
    })
    const late_tool = create_vault_keeper_context_tool(backend_context, undefined, { find: late_find })
    await expect(
      late_tool.execute!({ personalization: true, history: false }, { toolContext: { abortSignal: after.signal } as never }),
    ).rejects.toThrow('Cancelled after read')
    expect(late_find).toHaveBeenCalledTimes(1)
  })
})
