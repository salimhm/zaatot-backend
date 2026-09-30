import type { type_schema_input_agent_referee } from '@agent/referee/referee.schema.agent'

import { agent_referee } from '@agent/referee/referee.agent'
import { schema_input_agent_referee } from '@agent/referee/referee.schema.agent'

const examples = {
  allergen: {
    request: 'Can I consume this product with a milk allergy?',
    subject: { type: 'product', name: 'Example chocolate', brand: 'Example', barcode: '12345678' },
    findings: [
      {
        id: 'medic-finding-1',
        agent: 'Medic',
        topic: 'health',
        status: 'completed',
        claims: [
          {
            id: 'claim-milk-conflict',
            text: 'The declared ingredients contain milk and conflict with the supplied milk allergy.',
            evidence_refs: ['label.allergens.milk', 'profile.allergies.milk'],
          },
        ],
        required_constraints: [
          {
            code: 'preserve-allergen-conflict',
            severity: 'critical',
            action: 'exclude',
            message: 'Do not recommend this product as compatible with the supplied milk allergy.',
            applies_to: ['health recommendation'],
            source_refs: ['claim-milk-conflict'],
          },
        ],
        limitations: ['The assessment uses the supplied product label and user-reported restriction.'],
      },
    ],
    skeptic: {
      status: 'completed',
      accepted_claim_ids: ['claim-milk-conflict'],
      qualified_claim_ids: [],
      rejected_claim_ids: [],
      conflicts: [],
      uncertainties: [],
      limitations: [],
    },
    policy_constraints: [],
    candidate_ids: [],
  },
  'no-evidence': {
    request: 'Is this brand safe to buy?',
    subject: { type: 'brand', name: 'Example Brand', brand: 'Example Brand', barcode: null },
    findings: [
      {
        id: 'investigator-finding-1',
        agent: 'Investigator',
        topic: 'boycott',
        status: 'completed',
        claims: [
          {
            id: 'claim-no-matching-evidence',
            text: 'No matching boycott evidence was found in the checked sources.',
            evidence_refs: ['investigator.checked_sources'],
          },
        ],
        required_constraints: [
          {
            code: 'no-evidence-is-not-safety',
            severity: 'warning',
            action: 'qualify',
            message: 'Do not describe the absence of matching evidence as proof that the brand is safe.',
            applies_to: ['boycott conclusion'],
            source_refs: ['claim-no-matching-evidence'],
          },
        ],
        limitations: ['Only the checked sources are represented.'],
      },
    ],
    skeptic: {
      status: 'completed',
      accepted_claim_ids: ['claim-no-matching-evidence'],
      qualified_claim_ids: [],
      rejected_claim_ids: [],
      conflicts: [],
      uncertainties: ['Unchecked sources may contain additional evidence.'],
      limitations: ['Coverage is incomplete.'],
    },
    policy_constraints: [],
    candidate_ids: [],
  },
  conflict: {
    request: 'Give me a definitive assessment of this product.',
    subject: { type: 'product', name: 'Example drink', brand: 'Example', barcode: '87654321' },
    findings: [
      {
        id: 'finding-conflict-1',
        agent: 'Example Specialist',
        topic: 'product claim',
        status: 'completed',
        claims: [
          { id: 'claim-a', text: 'Source A supports the claim.', evidence_refs: ['source-a'] },
          { id: 'claim-b', text: 'Source B contradicts the claim.', evidence_refs: ['source-b'] },
        ],
        required_constraints: [],
        limitations: [],
      },
    ],
    skeptic: {
      status: 'needs_review',
      accepted_claim_ids: [],
      qualified_claim_ids: [],
      rejected_claim_ids: [],
      conflicts: [{ topic: 'product claim', claim_ids: ['claim-a', 'claim-b'], summary: 'The supplied sources disagree.' }],
      uncertainties: ['The conflict could not be resolved from the supplied evidence.'],
      limitations: ['No tie-breaking evidence was available.'],
    },
    policy_constraints: [],
    candidate_ids: [],
  },
} satisfies Record<string, type_schema_input_agent_referee>

const usage =
  'Usage:\n' +
  '  bun run --env-file=.env scripts/referee.cli.ts --example allergen|no-evidence|conflict\n' +
  '  bun run --env-file=.env scripts/referee.cli.ts --file path/to/input.json'

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

const result = await agent_referee(schema_input_agent_referee.parse(input))
console.log(JSON.stringify(result, null, 2))
process.exit(result.success ? 0 : 1)
