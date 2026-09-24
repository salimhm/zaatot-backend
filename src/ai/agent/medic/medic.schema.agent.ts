import { z } from 'zod'

export const schema_agent_medic = z
  .object({
    status: z.enum(['flags_found', 'no_flags_detected', 'insufficient_data']),
    mode: z.enum(['generic', 'personalized']).describe('Personalized requires current authorized profile context'),
    summary: z.string().min(1).describe('Bounded health-related finding in the user language, without a universal safety claim'),
    checked_scope: z.array(z.string().min(1)).describe('Only checks actually completed with adequate evidence'),
    risk_flags: z.array(
      z.object({
        kind: z.enum(['allergen_conflict', 'possible_allergen_exposure', 'ingredient_restriction', 'diet_conflict', 'clinical_rule']),
        summary: z.string().min(1),
        product_fact: z.string().min(1).describe('Verified product fact supporting this finding'),
        restriction: z.string().min(1).nullable().describe('Relevant permitted personal restriction, or null in generic mode'),
        evidence_refs: z.array(z.string().min(1)).min(1).describe('Existing evidence IDs, tool-result IDs, or precise supplied input field paths'),
        rule_id: z.string().min(1).nullable().describe('Supplied or retrieved clinical rule identifier; null when none was provided'),
      }),
    ),
    required_restrictions: z.array(z.string().min(1)).describe('Supported constraints for Referee; not the final recommendation'),
    missing_information: z.array(z.string().min(1)).describe('Required inputs, tools, permissions, or checks that remain unavailable'),
    limitations: z.array(z.string().min(1)),
  })
  .superRefine((data, context) => {
    if ((data.status === 'flags_found') !== data.risk_flags.length > 0) {
      context.addIssue({ code: 'custom', path: ['status'], message: 'Supported flags must be preserved with status flags_found' })
    }
    if (data.status === 'no_flags_detected' && (data.checked_scope.length === 0 || data.missing_information.length > 0)) {
      context.addIssue({ code: 'custom', path: ['status'], message: 'No flags requires completed checks and no missing required information' })
    }
    if (data.status === 'insufficient_data' && data.missing_information.length === 0) {
      context.addIssue({ code: 'custom', path: ['missing_information'], message: 'Explain what prevents the requested assessment' })
    }
    if (data.mode === 'generic' && data.risk_flags.some((flag) => flag.restriction !== null)) {
      context.addIssue({ code: 'custom', path: ['risk_flags'], message: 'Generic findings cannot claim a personal restriction was assessed' })
    }
  })

export type type_schema_agent_medic = z.infer<typeof schema_agent_medic>
