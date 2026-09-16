import { agent_product_brand_lookup } from '@agent/product-brand-lookup/product-brand-lookup.agent'

const message = process.argv.slice(2).join(' ').trim()

if (!message) {
  throw new Error('Provide a product name, brand name, or barcode.')
}

const result = await agent_product_brand_lookup(message)

console.dir(result, {
  depth: null,
})

if (!result.success) {
  process.exitCode = 1
}