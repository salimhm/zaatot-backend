import '@lib/env.lib'

import { VoltAgent } from '@voltagent/core'
import { elysiaServer } from '@voltagent/server-elysia'

import { $agent_bait_tester } from '@agent/bait-tester/bait-tester.agent'
import { $agent_detective } from '@agent/detective/detective.agent'

export const ai_server = new VoltAgent({
  agents: {
    detective: $agent_detective,
    bait_tester: $agent_bait_tester,
  },

  server: elysiaServer({
    port: 3141,
    hostname: '127.0.0.1',
    enableSwaggerUI: true,
  }),
})
