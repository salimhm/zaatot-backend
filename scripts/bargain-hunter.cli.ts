import { agent_bargain_hunter } from '@agent/bargain-hunter/bargain-hunter.agent'
import { schema_bargain_hunter_dimension } from '@agent/bargain-hunter/bargain-hunter.schema.agent'

const usage =
  'Usage: bun run --env-file=.env scripts/bargain-hunter.cli.ts --brand "Brand name" [--product "Product name"] [--barcode "Barcode"] ' +
  '[--dimension boycott|price|environment|health] [--max 1|2|3] [--request "Question"]'
const args = process.argv.slice(2)
let brand: string | undefined
let product: string | undefined
let barcode: string | undefined
let request: string | undefined
let max_candidates = 3
const dimensions: string[] = []

for (let index = 0; index < args.length; index++) {
  const flag = args[index]
  const value = args[index + 1]
  if (!flag?.startsWith('--') || !value || value.startsWith('--')) throw new Error(usage)

  if (flag === '--brand') brand = value.trim()
  else if (flag === '--product') product = value.trim()
  else if (flag === '--barcode') barcode = value.trim()
  else if (flag === '--request') request = value.trim()
  else if (flag === '--dimension') dimensions.push(value.trim())
  else if (flag === '--max') max_candidates = Number(value)
  else throw new Error(usage)
  index++
}

if (!brand) throw new Error(usage)
const requested_dimensions =
  dimensions.length > 0 ? dimensions.map((dimension) => schema_bargain_hunter_dimension.parse(dimension)) : ['boycott' as const]
const subject = product
  ? { type: 'product' as const, name: product, brand, barcode: barcode || null }
  : { type: 'brand' as const, name: brand, brand, barcode: null }
const result = await agent_bargain_hunter({
  request: request || `Find externally sourced alternatives to ${product || brand}.`,
  subject,
  requested_dimensions,
  constraints: [],
  max_candidates,
})

console.log(JSON.stringify(result, null, 2))
process.exit(result.success ? 0 : 1)
