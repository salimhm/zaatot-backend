import type { consumer_specialist_input } from '@ai/execution/execution-contract.ai'

import { unique_strings } from '@ai/adapter/utils.adapter.ai'
import { schema_agent_detective } from '@agent/detective/detective.schema.agent'
import { schema_agent_medic, schema_agent_medic_workflow_input } from '@agent/medic/medic.schema.agent'
import { dto_tool_medic_nutrition_assessor } from '@tool/medic-nutrition-assessor/medic-nutrition-assessor.dto.tool'
import { tool_medic_nutrition_assessor } from '@tool/medic-nutrition-assessor/medic-nutrition-assessor.tool'
import { dto_tool_medic_portion_calculator } from '@tool/medic-portion-calculator/medic-portion-calculator.dto.tool'
import { extract_requested_medic_portion, tool_medic_portion_calculator } from '@tool/medic-portion-calculator/medic-portion-calculator.tool'
import {
  create_medic_restriction_checker_tool,
  medic_missing_product_assessment,
  medic_missing_profile_assessment,
  medic_no_restrictions_assessment,
} from '@tool/medic-restriction-checker/medic-restriction-checker.tool'
import { schema_tool_vault_keeper_context_profile } from '@tool/vault-keeper/vault-keeper-context.dto.tool'

// Deterministic adapter: runs only the Dispatcher-selected Medic checks with verified tools.
export const adapter_medic = async (input: consumer_specialist_input, signal: AbortSignal) => {
  signal.throwIfAborted()
  const medic_checks = input.medic_checks ?? []
  if (medic_checks.length === 0) {
    const output = schema_agent_medic.parse({
      status: 'insufficient_data',
      mode: 'generic',
      summary: 'Medic did not receive an explicit check scope from Dispatcher.',
      checked_scope: [],
      risk_flags: [],
      required_restrictions: [],
      missing_information: ['Dispatcher medic_checks scope'],
      limitations: ['Medic did not run because its selected deterministic checks were not provided by the workflow plan.'],
    })
    return { status: 'needs_review' as const, output, limitations: output.limitations }
  }

  const detective = schema_agent_detective.safeParse(input.dependencies.Detective?.output)
  if (!detective.success || detective.data.status !== 'identified' || !detective.data.subject) {
    const output = medic_missing_product_assessment()
    return { status: 'needs_input' as const, output, limitations: output.limitations }
  }

  const subject = detective.data.subject
  if (subject.type !== 'product' || !subject.barcode) {
    const output = medic_missing_product_assessment()
    return { status: 'needs_input' as const, output, limitations: output.limitations }
  }

  const exact_product = detective.data.related_products.items.find((product) => product.barcode === subject.barcode)
  const product = exact_product ?? {
    source: subject.source,
    product_id: null,
    barcode: subject.barcode,
    type: null,
    name: subject.name,
    brand_name: subject.brand_name,
    brand_candidates: subject.brand_candidates,
    images: [],
    nova_group: null,
    ecoscore: null,
    nutriscore: null,
    ingredients: null,
    allergens: null,
    nutrition: null,
  }

  const vault = input.dependencies['Vault Keeper']
  const vault_output = vault?.output
  const released_profile =
    vault?.permissions?.personalization === true && vault_output && typeof vault_output === 'object' && 'profile' in vault_output
      ? schema_tool_vault_keeper_context_profile.safeParse(vault_output.profile)
      : null
  const profile = released_profile?.success && released_profile.data !== null ? released_profile.data : null
  const vault_missing_information =
    profile === null ? unique_strings([...(vault?.limitations ?? []), 'No permitted personal product-fit context was released by Vault Keeper.']) : []

  const context = schema_agent_medic_workflow_input.parse({
    request: input.prompt,
    detective: {
      product,
      sources_checked: detective.data.sources_checked,
    },
    vault_keeper: {
      personalization_permitted: profile !== null,
      profile,
      missing_information: vault_missing_information,
    },
  })

  const barcode = context.detective.product.barcode
  if (!barcode) {
    const output = medic_missing_product_assessment()
    return { status: 'needs_input' as const, output, limitations: output.limitations }
  }

  const has_check = (check: (typeof medic_checks)[number]) => medic_checks.includes(check)

  const nutrition_assessment = has_check('nutrition_assessment')
    ? dto_tool_medic_nutrition_assessor.assessment.parse(
        await input.use_tool(
          async () => await tool_medic_nutrition_assessor.execute!({ barcode }, { toolContext: { abortSignal: signal } } as never),
          {
            name: 'tool_medic_nutrition_assessor',
            title: 'Assessing verified nutrition label',
            detail: 'Applying the fixed nutrition-label profile to the exact product variant.',
          },
        ),
      )
    : undefined

  const requested_portion = has_check('portion_calculation') ? extract_requested_medic_portion(context.request) : null
  const portion_calculation =
    requested_portion === null
      ? undefined
      : dto_tool_medic_portion_calculator.calculation.parse(
          await input.use_tool(
            async () =>
              await tool_medic_portion_calculator.execute!({ barcode, portion: requested_portion }, {
                toolContext: { abortSignal: signal },
              } as never),
            {
              name: 'tool_medic_portion_calculator',
              title: 'Calculating verified nutrient quantities',
              detail: 'Scaling verified nutrition facts for ' + requested_portion.value + ' ' + requested_portion.unit + '.',
            },
          ),
        )
  const portion_missing_information =
    has_check('portion_calculation') && requested_portion === null
      ? ['One explicit amount and unit are required for the requested portion calculation.']
      : []
  const portion_limitations =
    has_check('portion_calculation') && requested_portion === null
      ? ['Medic does not infer a portion when the request contains zero or multiple amounts.']
      : []

  const restriction_assessment = !has_check('restriction_check')
    ? undefined
    : profile === null
      ? medic_missing_profile_assessment()
      : profile.allergens.length === 0 && profile.avoided_ingredients.length === 0
        ? medic_no_restrictions_assessment()
        : schema_agent_medic.parse(
            await input.use_tool(
              async () =>
                await create_medic_restriction_checker_tool(profile).execute!({ barcode }, { toolContext: { abortSignal: signal } } as never),
              {
                name: 'tool_medic_restriction_checker',
                title: 'Checking verified allergens and ingredients',
                detail: 'Comparing the exact product variant with permitted restrictions.',
              },
            ),
          )

  signal.throwIfAborted()

  const nutrition_flags = (nutrition_assessment?.findings ?? [])
    .filter((finding) => finding.level === 'high')
    .map((finding) => ({
      kind: 'clinical_rule' as const,
      summary: `General nutrition-label concern: verified ${finding.label.toLocaleLowerCase('en-US')} is high under the ${nutrition_assessment!.ruleset.name}.`,
      product_fact: `The exact product records ${finding.source_measurement.value} ${finding.source_measurement.unit} of ${finding.label.toLocaleLowerCase('en-US')} ${finding.source_measurement.basis.replace('_', ' ')}.`,
      restriction: null,
      evidence_refs: [`nutrition_assessment.${finding.evidence_ref}`, 'nutrition_assessment.ruleset.reference_url'],
      rule_id: finding.rule_id,
    }))
  const restriction_flags = restriction_assessment?.risk_flags ?? []
  const risk_flags = [...nutrition_flags, ...restriction_flags]
  const checked_scope = unique_strings([
    ...(nutrition_assessment?.status === 'assessed'
      ? ['General nutrition-label screen completed for verified total fat, saturated fat, total sugars, and salt.']
      : nutrition_assessment?.status === 'partial'
        ? ['Partial general nutrition-label screen completed with the available verified nutrient facts.']
        : []),
    ...(portion_calculation?.status === 'calculated' ? ['Verified nutrient measurements scaled for the requested exact-product portion.'] : []),
    ...(restriction_assessment?.checked_scope ?? []),
  ])
  const missing_information = unique_strings([
    ...(nutrition_assessment?.status === 'assessed' ? [] : (nutrition_assessment?.missing_information ?? [])),
    ...(portion_calculation?.missing_information ?? []),
    ...portion_missing_information,
    ...(restriction_assessment?.missing_information ?? []),
  ])
  const limitations = unique_strings([
    ...(nutrition_assessment?.limitations ?? []),
    ...(portion_calculation?.limitations ?? []),
    ...portion_limitations,
    ...(restriction_assessment?.limitations ?? []),
  ])
  const required_restrictions = unique_strings([
    ...(restriction_assessment?.required_restrictions ?? []),
    ...nutrition_flags.map((flag) => `Preserve the general nutrition concern supported by ${flag.rule_id}.`),
  ])
  const status = risk_flags.length > 0 ? 'flags_found' : missing_information.length > 0 ? 'insufficient_data' : 'no_flags_detected'
  const summary =
    risk_flags.length > 0
      ? `The requested Medic checks found ${risk_flags.length} supported concern${risk_flags.length === 1 ? '' : 's'} for the exact product variant.`
      : missing_information.length > 0
        ? 'The requested Medic checks are incomplete because required product facts, permitted context, or a precise portion are unavailable.'
        : 'No supported concern was found within the completed requested Medic checks for the exact product variant.'

  const output = schema_agent_medic.parse({
    status,
    mode: profile === null ? 'generic' : 'personalized',
    summary,
    checked_scope,
    risk_flags,
    required_restrictions,
    missing_information,
    limitations,
    ...(nutrition_assessment ? { nutrition_assessment } : {}),
    ...(portion_calculation ? { portion_calculation } : {}),
  })

  return {
    status: output.status === 'insufficient_data' ? ('needs_input' as const) : ('completed' as const),
    output,
    limitations: output.limitations,
  }
}
