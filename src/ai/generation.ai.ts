import type { generateText } from 'ai'

// VoltAgent 2.7 adds server-owned instructions to messages internally.
// Use only in our wrappers, which accept user text rather than caller-supplied
// message roles. This opts in to that representation without muting other warnings.
export const trusted_agent_generation_options = {
  allowSystemInMessages: true,
} satisfies Pick<Parameters<typeof generateText>[0], 'allowSystemInMessages'>
