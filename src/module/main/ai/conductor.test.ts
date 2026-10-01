import type { type_schema_agent_conductor_plan } from '@agent/conductor/conductor.schema.agent'

import { describe, expect, it, spyOn } from 'bun:test'

import { $agent_conductor, agent_conductor, normalize_conductor_plan } from '@agent/conductor/conductor.agent'
import { prompt_agent_conductor } from '@agent/conductor/conductor.prompt.agent'

const plan: type_schema_agent_conductor_plan = {
  intent: 'The user asks whether Coca-Cola is boycotted.',
  steps: [
    { agent: 'Dispatcher', purpose: 'Select checks' },
    { agent: 'Detective', purpose: 'Resolve the brand' },
    { agent: 'Investigator', purpose: 'Check boycott evidence' },
  ],
}

describe('Conductor plan', () => {
  it('drops pre-planning and repeated roles instead of failing the request', () => {
    expect(
      normalize_conductor_plan({
        intent: plan.intent,
        steps: [
          { agent: 'Bodyguard', purpose: 'Check safety' },
          ...plan.steps,
          { agent: 'Conductor', purpose: 'Plan' },
          { agent: 'Detective', purpose: 'Resolve again' },
        ],
      }),
    ).toEqual(plan)
  })

  it('validates, normalizes, and deterministically plans from the request text only', async () => {
    const generate = spyOn($agent_conductor, 'generateText').mockResolvedValue({
      output: { ...plan, steps: [{ agent: 'Bodyguard', purpose: 'Check safety' }, ...plan.steps] },
    } as unknown as Awaited<ReturnType<typeof $agent_conductor.generateText>>)
    try {
      expect(await agent_conductor('Is Coca-Cola boycotted?')).toEqual({ success: true, data: plan })
      expect(generate.mock.calls[0]![0]).toBe('Is Coca-Cola boycotted?')
      expect(generate.mock.calls[0]![1]).toMatchObject({ temperature: 0, maxRetries: 0 })

      generate.mockResolvedValue({ output: { intent: '', steps: [] } } as unknown as Awaited<ReturnType<typeof $agent_conductor.generateText>>)
      expect((await agent_conductor('Is Coca-Cola boycotted?')).success).toBe(false)
    } finally {
      generate.mockRestore()
    }
  })

  it('does not start a cancelled plan or return a late one', async () => {
    const controller = new AbortController()
    controller.abort()
    const generate = spyOn($agent_conductor, 'generateText')
    try {
      expect((await agent_conductor('Check this', controller.signal)).success).toBe(false)
      expect(generate).not.toHaveBeenCalled()

      const late = new AbortController()
      generate.mockImplementation(async () => {
        late.abort()
        return { output: plan } as Awaited<ReturnType<typeof $agent_conductor.generateText>>
      })
      expect((await agent_conductor('Check this', late.signal)).success).toBe(false)
    } finally {
      generate.mockRestore()
    }
  })

  it('does not promise tools or private data it does not have', () => {
    expect(prompt_agent_conductor).not.toContain('extractIntent')
    expect(prompt_agent_conductor).not.toContain('private database')
  })
})
