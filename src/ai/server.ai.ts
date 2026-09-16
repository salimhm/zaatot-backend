import '@lib/env.lib'

import { VoltAgent } from '@voltagent/core'
import { elysiaServer } from '@voltagent/server-elysia'

import { $agent_product_brand_lookup } from '@agent/product-brand-lookup/product-brand-lookup.agent'

export const ai_server = new VoltAgent({
  agents: {
    product_brand_lookup: $agent_product_brand_lookup,
  },

  server: elysiaServer({
    port: 3141,
    hostname: '127.0.0.1',
    enableSwaggerUI: true,
  }),
})
