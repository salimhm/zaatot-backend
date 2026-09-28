import { describe, expect, it, spyOn } from 'bun:test'

import { $agent_bodyguard, agent_bodyguard, bodyguard_generation_retry_limit } from '@agent/bodyguard/bodyguard.agent'

const allowed = {
  safe: true,
  action: 'allow' as const,
  riskLevel: 'none' as const,
  risks: [],
  reason: 'Ordinary product request.',
  confidence: 1,
}

describe('Bodyguard', () => {
  it('configures bounded SDK retries for temporary provider capacity failures', async () => {
    const generate = spyOn($agent_bodyguard, 'generateText').mockResolvedValue({ output: allowed } as Awaited<
      ReturnType<typeof $agent_bodyguard.generateText>
    >)
    const signal = new AbortController().signal
    try {
      expect(await agent_bodyguard('Look up this product.', signal)).toEqual({ success: true, data: allowed })
      expect(generate.mock.calls[0]?.[1]?.maxRetries).toBe(bodyguard_generation_retry_limit)
      expect(generate.mock.calls[0]?.[1]?.abortSignal).toBe(signal)
    } finally {
      generate.mockRestore()
    }
  })
})
