import { agent_investigator } from '@agent/investigator/investigator.agent'

const args = process.argv.slice(2)
const include_analysis_draft = !args.includes('--no-draft')
const brand_name = args
  .filter((arg) => arg !== '--no-draft')
  .join(' ')
  .trim()

if (!brand_name) {
  console.error('Usage: bun run --env-file=.env scripts/investigator.cli.ts "Brand name" [--no-draft]')
  process.exit(1)
}

const result = await agent_investigator({ brand_name }, { include_analysis_draft })

if (result.success) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.error(result.data)
}

process.exit(result.success ? 0 : 1)
