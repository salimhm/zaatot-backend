import { agent_investigator } from '@agent/investigator/investigator.agent'

const args = process.argv.slice(2)
const usage =
  'Usage: bun run --env-file=.env scripts/investigator.cli.ts "Question or name" [--brand | --product] [--no-draft]\n' +
  '   or: bun run --env-file=.env scripts/investigator.cli.ts --product "Product name" --brand "Brand name" [--no-draft]'
let include_analysis_draft = true
let explicit_brand = false
let explicit_product = false
let brand_name: string | undefined
let product_name: string | undefined
const positional: string[] = []
let invalid = false

for (let index = 0; index < args.length; index++) {
  const arg = args[index]
  if (arg === '--no-draft') {
    include_analysis_draft = false
  } else if (arg === '--brand' || arg === '--product') {
    if (arg === '--brand' ? explicit_brand : explicit_product) {
      invalid = true
      break
    }
    if (arg === '--brand') explicit_brand = true
    else explicit_product = true

    const next = args[index + 1]
    if (next && !next.startsWith('--')) {
      if (arg === '--brand') brand_name = next.trim()
      else product_name = next.trim()
      index++
    }
  } else if (arg?.startsWith('--')) {
    invalid = true
    break
  } else if (arg) {
    positional.push(arg)
  }
}

const remaining_name = positional.join(' ').trim()
if (explicit_brand || explicit_product) {
  if (remaining_name && Number(explicit_brand && brand_name === undefined) + Number(explicit_product && product_name === undefined) === 1) {
    if (explicit_brand && brand_name === undefined) brand_name = remaining_name
    else product_name = remaining_name
  } else if (remaining_name) {
    invalid = true
  }
  if ((explicit_brand && !brand_name) || (explicit_product && !product_name)) invalid = true
} else if (!remaining_name) {
  invalid = true
}

if (invalid) {
  console.error(usage)
  process.exit(1)
}

const input =
  explicit_brand || explicit_product ? { brand_name: brand_name ?? null, ...(product_name ? { product_name } : {}) } : { query: remaining_name }
const result = await agent_investigator(input, { include_analysis_draft })

if (result.success) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.error(result.data)
}

process.exit(result.success ? 0 : 1)
