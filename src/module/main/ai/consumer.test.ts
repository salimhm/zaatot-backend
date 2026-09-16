import type { type_schema_agent_bodyguard } from '@agent/bodyguard/bodyguard.schema.agent'
import type { consumer_dependency } from '@ai/workflow.ai'

import { describe, expect, it, mock } from 'bun:test'

import { run_consumer_workflow } from '@ai/workflow.ai'
import { schema_agent_conductor_result } from '@agent/conductor/conductor.schema.agent'

const request = { prompt: 'Check this cereal', user_id: 7 }
const allowed: type_schema_agent_bodyguard = {
  safe: true,
  riskLevel: 'none',
  risks: [],
  action: 'allow',
  reason: 'Product analysis',
  confidence: 1,
}

function dependencies(overrides: Partial<consumer_dependency> = {}) {
  return {
    bodyguard: mock(async (_prompt: string, _signal: AbortSignal): Promise<unknown> => allowed),
    conductor: mock(
      async (prompt: string, _signal: AbortSignal): Promise<unknown> => ({
        intent: prompt,
        steps: [{ agent: 'Dispatcher', purpose: 'Route the requested product checks' }],
      }),
    ),
    ...overrides,
  }
}

describe('Consumer workflow startup', () => {
  it('initializes an execution and runs Bodyguard before Conductor planning', async () => {
    const order: string[] = []
    const dependency = dependencies({
      bodyguard: mock(async () => {
        order.push('Bodyguard')
        return allowed
      }),
      conductor: mock(async () => {
        order.push('Conductor')
        return { intent: 'Product analysis', steps: [{ agent: 'Dispatcher', purpose: 'Plan checks' }] }
      }),
    })
    const result = await run_consumer_workflow(request, { dependency })
    expect(schema_agent_conductor_result.safeParse(result).success).toBe(true)
    expect(result.status).toBe('partial')
    expect(result).not.toHaveProperty('user_id')
    expect(result.product).toBeNull()
    expect(result.assessments).toEqual([])
    expect(result.alternatives).toEqual([])
    expect(result.explanation).toBeNull()
    expect(result.sources).toEqual([])
    expect(result).not.toHaveProperty('bodyguard')
    expect(result).not.toHaveProperty('conductor')
    expect(order).toEqual(['Bodyguard', 'Conductor'])
    expect(result.limitations.join(' ')).toContain('have not been executed')
  })

  for (const decision of [
    { safe: false, action: 'allow', status: 'blocked' },
    { safe: true, action: 'block', status: 'blocked' },
    { safe: true, action: 'sanitize', status: 'blocked' },
    { safe: false, action: 'human_review', status: 'needs_review' },
  ] as const) {
    it(`stops when safe=${decision.safe} and action=${decision.action}`, async () => {
      const dependency = dependencies({ bodyguard: mock(async () => ({ ...allowed, safe: decision.safe, action: decision.action })) })
      const result = await run_consumer_workflow(request, { dependency })
      expect(result.status).toBe(decision.status)
      expect(result.explanation).toBeNull()
      expect(dependency.conductor).not.toHaveBeenCalled()
    })
  }

  for (const invalid of [{ safe: true }, { ...allowed, confidence: 2 }, null]) {
    it('fails closed for malformed Bodyguard output', async () => {
      const dependency = dependencies({ bodyguard: mock(async () => invalid) })
      const result = await run_consumer_workflow(request, { dependency })
      expect(result.status).toBe('error')
      expect(dependency.conductor).not.toHaveBeenCalled()
    })
  }

  it('does not expose provider errors or continue after Bodyguard failure', async () => {
    const dependency = dependencies({
      bodyguard: mock(async () => {
        throw new Error('private-provider-detail')
      }),
    })
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('error')
    expect(JSON.stringify(result)).not.toContain('private-provider-detail')
    expect(dependency.conductor).not.toHaveBeenCalled()
  })

  it('rejects an invalid Conductor plan', async () => {
    const dependency = dependencies({ conductor: mock(async () => ({ intent: 'Check', steps: [{ agent: 'Unknown', purpose: 'Invalid role' }] })) })
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('error')
    expect(result.explanation).toBeNull()
  })

  it('rejects invalid workflow input before agent execution', async () => {
    const dependency = dependencies()
    for (const invalid of [
      { ...request, prompt: '   ' },
      { ...request, user_id: 0 },
    ]) {
      await expect(run_consumer_workflow(invalid, { dependency })).rejects.toThrow()
    }
    expect(dependency.bodyguard).not.toHaveBeenCalled()
    expect(dependency.conductor).not.toHaveBeenCalled()
  })

  it('does not invoke agents for a cancelled request', async () => {
    const dependency = dependencies()
    const result = await run_consumer_workflow(request, { dependency, signal: AbortSignal.abort() })
    expect(result.status).toBe('error')
    expect(dependency.bodyguard).not.toHaveBeenCalled()
  })

  it('propagates a deadline and stops before planning', async () => {
    const dependency = dependencies({
      bodyguard: mock(async (_prompt, signal) => {
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve()
          else signal.addEventListener('abort', () => resolve(), { once: true })
        })
        signal.throwIfAborted()
        return allowed
      }),
    })
    const result = await run_consumer_workflow(request, { dependency, timeout_ms: 20 })
    expect(result.status).toBe('error')
    expect(dependency.conductor).not.toHaveBeenCalled()
  })

  it('keeps concurrent users and execution IDs separate', async () => {
    const dependency = dependencies()
    const results = await Promise.all([
      run_consumer_workflow({ prompt: 'First request', user_id: 1 }, { dependency }),
      run_consumer_workflow({ prompt: 'Second request', user_id: 2 }, { dependency }),
    ])
    expect(results[0]!.execution_id).not.toBe(results[1]!.execution_id)
    for (const result of results) expect(result).not.toHaveProperty('user_id')
    expect(dependency.conductor).toHaveBeenCalledWith('First request', expect.any(AbortSignal))
    expect(dependency.conductor).toHaveBeenCalledWith('Second request', expect.any(AbortSignal))
  })
})
