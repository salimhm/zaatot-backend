import { z } from 'zod'

import { schema_product_detective, schema_source_detective } from '@agent/detective/detective.schema.agent'
import { schema_tool_medic_nutrition_assessment } from '@tool/medic-nutrition-assessor/medic-nutrition-assessor.dto.tool'
import { schema_tool_medic_portion_calculation } from '@tool/medic-portion-calculator/medic-portion-calculator.dto.tool'
import { schema_tool_vault_keeper_context_profile } from '@tool/vault-keeper/vault-keeper-context.dto.tool'

export const schema_agent_medic_workflow_input = z
  .object({
    request: z.string().min(1),
    detective: z
      .object({
        product: schema_product_detective,
        sources_checked: z.array(schema_source_detective),
      })
      .strict(),
    vault_keeper: z
      .object({
        personalization_permitted: z.boolean(),
        profile: schema_tool_vault_keeper_context_profile.nullable(),
        missing_information: z.array(z.string().min(1)),
      })
      .strict()
      .superRefine((context, issue) => {
        if (context.personalization_permitted !== (context.profile !== null)) {
          issue.addIssue({
            code: 'custom',
            path: ['personalization_permitted'],
            message: 'Personalization is permitted only when Vault Keeper released a minimized profile.',
          })
        }
      }),
  })
  .strict()

export type type_schema_agent_medic_workflow_input = z.infer<typeof schema_agent_medic_workflow_input>

export const schema_agent_medic = z
  .object({
    status: z.enum(['flags_found', 'no_flags_detected', 'insufficient_data']),
    mode: z.enum(['generic', 'personalized']).describe('Personalized requires current authorized profile context'),
    summary: z.string().min(1).describe('Bounded health-related finding in the user language, without a universal safety claim'),
    checked_scope: z.array(z.string().min(1)).describe('Only checks actually completed with adequate evidence'),
    risk_flags: z.array(
      z.object({
        kind: z.enum([
          'allergen_conflict',
          'possible_allergen_exposure',
          'ingredient_restriction',
          'possible_ingredient_exposure',
          'diet_conflict',
          'clinical_rule',
        ]),
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
    nutrition_assessment: schema_tool_medic_nutrition_assessment.optional(),
    portion_calculation: schema_tool_medic_portion_calculation.optional(),
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
    if (data.nutrition_assessment && data.nutrition_assessment.status !== 'assessed' && data.status === 'no_flags_detected') {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'A partial or unavailable nutrition screen cannot be represented as no flags detected.',
      })
    }
    if (data.nutrition_assessment?.classification === 'less_favourable' && !data.risk_flags.some((flag) => flag.rule_id !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['risk_flags'],
        message: 'A less favourable nutrition assessment requires its supported rule finding to be preserved.',
      })
    }
  })

export type type_schema_agent_medic = z.infer<typeof schema_agent_medic>
