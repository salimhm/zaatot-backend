import type { type_schema_input_agent_storyteller } from '@agent/storyteller/storyteller.schema.agent'

import { schema_input_agent_storyteller } from '@agent/storyteller/storyteller.schema.agent'

// Keep the standalone CLI compatible with the environment name used by the
// current local setup without changing the server provider contract.
process.env.CF_API_KEY ||= process.env.CF_WORKER_AI_API_KEY
const { agent_storyteller } = await import('@agent/storyteller/storyteller.agent')

const examples = {
  boycott: {
    request: 'Should I boycott Coca-Cola? Use sourced evidence and preserve uncertainty.',
    subject: { type: 'brand', name: 'Coca-Cola', brand: 'Coca-Cola', barcode: null },
    decision: 'pass',
    decision_summary: 'The reviewed evidence may be explained with its sourcing and limitations intact.',
    accepted_claims: [
      {
        id: 'investigator.checks[0]',
        text: 'Local knowledge matched Coca-Cola with a boycott decision.',
        qualification: 'This records sourced campaign evidence rather than an independent final judgment by Ztroop.',
        citation_ids: ['investigator-source-1'],
      },
      {
        id: 'investigator.checks[1]',
        text: 'Boycat matched Coca-Cola with a boycott decision.',
        qualification: 'The result is limited to the provider evidence checked during this request.',
        citation_ids: ['investigator-source-2'],
      },
    ],
    excluded_claims: [],
    constraints: [],
    limitations: [
      'Source retrieval time is not the same as the publication date or freshness of the underlying evidence.',
      'The checked sources are not a complete registry of every relevant claim.',
    ],
    sources: [
      { id: 'investigator-source-1', provider: 'BDS Movement Corporate Targeting Guide' },
      { id: 'investigator-source-2', provider: 'Boycat' },
    ],
    repair_feedback: [],
  },
  health: {
    request: 'Can I consume this chocolate if I have a milk allergy?',
    subject: { type: 'product', name: 'Example chocolate', brand: 'Example', barcode: '12345678' },
    decision: 'restrict',
    decision_summary: 'The verified allergen conflict restricts a compatibility recommendation.',
    accepted_claims: [
      {
        id: 'medic.risk_flags[0]',
        text: 'The verified label declares milk and conflicts with the supplied milk allergy.',
        qualification: 'This applies to the exact product variant and supplied restriction.',
        citation_ids: [],
      },
    ],
    excluded_claims: [],
    constraints: [
      {
        code: 'preserve-allergen-conflict',
        action: 'exclude',
        message: 'Do not recommend this product as compatible with the supplied milk allergy.',
      },
    ],
    limitations: ['The assessment depends on the verified label being current and complete.'],
    sources: [],
    repair_feedback: [],
  },
} satisfies Record<string, type_schema_input_agent_storyteller>

const usage =
  'Usage:\n' +
  '  bun run --env-file=.env scripts/storyteller.cli.ts --example boycott|health\n' +
  '  bun run --env-file=.env scripts/storyteller.cli.ts --file path/to/input.json'

const args = process.argv.slice(2)
let input: unknown

if (args[0] === '--example' && args[1] && args.length === 2) {
  input = examples[args[1] as keyof typeof examples]
  if (!input) throw new Error(`${usage}\n\nUnknown example: ${args[1]}`)
} else if (args[0] === '--file' && args[1] && args.length === 2) {
  input = await Bun.file(args[1]).json()
} else {
  throw new Error(usage)
}

const result = await agent_storyteller(schema_input_agent_storyteller.parse(input))
console.log(JSON.stringify(result, null, 2))
process.exit(result.success ? 0 : 1)
