import { agent_investigator } from '@agent/investigator/investigator.agent'

const args = process.argv.slice(2)
const include_analysis_draft = !args.includes('--no-draft')
const explicit_brand = args.includes('--brand')
const explicit_product = args.includes('--product')
const query = args
  .filter((arg) => !['--no-draft', '--brand', '--product'].includes(arg))
  .join(' ')
  .trim()

if (!query || (explicit_brand && explicit_product)) {
  console.error('Usage: bun run --env-file=.env scripts/investigator.cli.ts "Question or name" [--brand | --product] [--no-draft]')
  process.exit(1)
}

const input = explicit_brand ? { brand_name: query } : explicit_product ? { brand_name: null, product_name: query } : { query }
const result = await agent_investigator(input, { include_analysis_draft })

if (result.success) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.error(result.data)
}

process.exit(result.success ? 0 : 1)
