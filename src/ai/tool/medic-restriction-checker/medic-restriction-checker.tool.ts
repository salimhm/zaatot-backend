import type { z } from 'zod'

import { createTool } from '@voltagent/core'

import { dto_tool_medic_restriction_checker } from '@tool/medic-restriction-checker/medic-restriction-checker.dto.tool'

import { service_product } from '@module/main/product/product.service'

type medic_profile = z.infer<typeof dto_tool_medic_restriction_checker.profile>
type medic_composition = z.infer<typeof dto_tool_medic_restriction_checker.composition>
type medic_assessment = z.infer<typeof dto_tool_medic_restriction_checker.result>
type medic_risk_flag = medic_assessment['risk_flags'][number]

type medic_composition_lookup = typeof service_product.find_composition_by_barcode

export type medic_restriction_checker_dependency = {
  find_composition_by_barcode: medic_composition_lookup
}

const normalize_code = (value: string) =>
  value
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/^[a-z]{2,3}:/, '')
    .replace(/[\s_-]+/g, ' ')

const restrictions_from = (values: string[]) => {
  const restrictions = new Map<string, { value: string; index: number }>()
  values.forEach((value, index) => {
    const normalized = normalize_code(value)
    if (normalized && !restrictions.has(normalized)) restrictions.set(normalized, { value, index })
  })
  return restrictions
}

const fact_index = (values: string[]) => {
  const facts = new Map<string, { value: string; index: number }>()
  values.forEach((value, index) => {
    const normalized = normalize_code(value)
    if (normalized && !facts.has(normalized)) facts.set(normalized, { value, index })
  })
  return facts
}

const source_is_current = (composition: medic_composition) => {
  if (!composition.source.fresh_until) return true
  const fresh_until = Date.parse(composition.source.fresh_until)
  return !Number.isFinite(fresh_until) || fresh_until > Date.now()
}

const current_composition_missing_information = (composition: medic_composition) => {
  const missing_information: string[] = []
  if (!composition.completeness.ingredients) {
    missing_information.push('A complete verified ingredient list is unavailable for the exact product variant.')
  }
  if (!composition.completeness.allergens) {
    missing_information.push('A complete verified allergen declaration is unavailable for the exact product variant.')
  }
  if (!source_is_current(composition)) {
    missing_information.push('The verified ingredient and allergen facts for this exact product variant are past their freshness date.')
  }
  return missing_information
}

export const medic_missing_profile_assessment = (): medic_assessment => ({
  status: 'insufficient_data',
  mode: 'generic',
  summary: 'A permitted allergen and ingredient restriction profile is required for a personal compatibility check.',
  checked_scope: [],
  risk_flags: [],
  required_restrictions: [],
  missing_information: ['Permitted allergen and avoided-ingredient restrictions from Vault Keeper'],
  limitations: ['Personal ingredient compatibility has not been assessed without permitted profile context.'],
})

export const medic_missing_product_assessment = (mode: medic_assessment['mode'] = 'personalized'): medic_assessment => ({
  status: 'insufficient_data',
  mode,
  summary: 'One resolved exact product variant is required before ingredients or allergens can be checked.',
  checked_scope: [],
  risk_flags: [],
  required_restrictions: [],
  missing_information: ['Resolved product barcode for the exact variant'],
  limitations: ['A brand name or ambiguous product match cannot be used as an ingredient label.'],
})

export const medic_no_restrictions_assessment = (): medic_assessment => ({
  status: 'no_flags_detected',
  mode: 'personalized',
  summary: 'No permitted allergen or avoided-ingredient restrictions are recorded, so no personal ingredient comparison was required.',
  checked_scope: ['Permitted allergen and avoided-ingredient restrictions'],
  risk_flags: [],
  required_restrictions: [],
  missing_information: [],
  limitations: ['This check does not assess allergies or ingredient restrictions that are not present in the permitted profile.'],
})

export const assess_medic_restrictions = (profile: medic_profile, composition: medic_composition): medic_assessment => {
  const allergen_restrictions = restrictions_from(profile.allergens)
  const ingredient_restrictions = restrictions_from(profile.avoided_ingredients)
  if (allergen_restrictions.size === 0 && ingredient_restrictions.size === 0) return medic_no_restrictions_assessment()

  const allergen_facts = fact_index(composition.allergens)
  const ingredient_facts = fact_index(composition.ingredients)
  const risk_flags: medic_risk_flag[] = []
  const required_restrictions: string[] = []
  const confirmed_allergens = new Set<string>()
  const confirmed_ingredients = new Set<string>()

  for (const [normalized, restriction] of allergen_restrictions) {
    const allergen = allergen_facts.get(normalized)
    const ingredient = ingredient_facts.get(normalized)
    const fact = allergen ?? ingredient
    if (!fact) continue

    confirmed_allergens.add(normalized)
    risk_flags.push({
      kind: 'allergen_conflict',
      summary: `Confirmed conflict: the verified product ${allergen ? 'allergen declaration' : 'ingredient list'} includes "${fact.value}".`,
      product_fact: `The active product fact includes "${fact.value}" in its ${allergen ? 'allergen declaration' : 'ingredient list'}.`,
      restriction: `Declared allergen restriction: ${restriction.value}`,
      evidence_refs: [`composition.${allergen ? 'allergens' : 'ingredients'}[${fact.index}]`, `permitted_profile.allergens[${restriction.index}]`],
      rule_id: null,
    })
    required_restrictions.push(`Preserve the declared allergen restriction for ${restriction.value}.`)
  }

  for (const [normalized, restriction] of ingredient_restrictions) {
    const ingredient = ingredient_facts.get(normalized)
    if (!ingredient) continue

    confirmed_ingredients.add(normalized)
    risk_flags.push({
      kind: 'ingredient_restriction',
      summary: `Confirmed conflict: the verified ingredient list includes "${ingredient.value}".`,
      product_fact: `The active product fact includes "${ingredient.value}" in its ingredient list.`,
      restriction: `Avoided ingredient restriction: ${restriction.value}`,
      evidence_refs: [`composition.ingredients[${ingredient.index}]`, `permitted_profile.avoided_ingredients[${restriction.index}]`],
      rule_id: null,
    })
    required_restrictions.push(`Preserve the avoided-ingredient restriction for ${restriction.value}.`)
  }

  const missing_information = current_composition_missing_information(composition)
  const allergens_complete = composition.completeness.ingredients && composition.completeness.allergens && source_is_current(composition)
  const ingredients_complete = composition.completeness.ingredients && source_is_current(composition)

  if (!allergens_complete) {
    for (const [normalized, restriction] of allergen_restrictions) {
      if (confirmed_allergens.has(normalized)) continue
      risk_flags.push({
        kind: 'possible_allergen_exposure',
        summary: `Possible exposure: incomplete or stale verified composition facts cannot rule out "${restriction.value}" for this exact variant.`,
        product_fact: 'The active product fact does not provide a complete current ingredient and allergen record.',
        restriction: `Declared allergen restriction: ${restriction.value}`,
        evidence_refs: ['composition.completeness', `permitted_profile.allergens[${restriction.index}]`],
        rule_id: null,
      })
      required_restrictions.push(`Do not treat ${restriction.value} as cleared until a complete current label is verified.`)
    }
  }

  if (!ingredients_complete) {
    for (const [normalized, restriction] of ingredient_restrictions) {
      if (confirmed_ingredients.has(normalized)) continue
      risk_flags.push({
        kind: 'possible_ingredient_exposure',
        summary: `Possible exposure: the incomplete or stale verified ingredient record cannot rule out "${restriction.value}" for this exact variant.`,
        product_fact: 'The active product fact does not provide a complete current ingredient record.',
        restriction: `Avoided ingredient restriction: ${restriction.value}`,
        evidence_refs: ['composition.completeness.ingredients', `permitted_profile.avoided_ingredients[${restriction.index}]`],
        rule_id: null,
      })
      required_restrictions.push(`Do not treat ${restriction.value} as cleared until a complete current ingredient list is verified.`)
    }
  }

  const checked_scope = [
    ...(profile.allergens.length ? ['Verified product allergens and ingredients compared with permitted allergen restrictions'] : []),
    ...(profile.avoided_ingredients.length ? ['Verified product ingredients compared with permitted avoided-ingredient restrictions'] : []),
  ]

  const confirmed_count = confirmed_allergens.size + confirmed_ingredients.size
  const possible_count = risk_flags.length - confirmed_count
  const limitations = [
    ...missing_information,
    'Matches use normalized exact ingredient or allergen codes. Ingredient equivalence and clinical-rule inference were not applied.',
  ]

  if (risk_flags.length > 0) {
    const summary =
      confirmed_count > 0
        ? `Verified product facts show ${confirmed_count} confirmed restriction conflict${confirmed_count === 1 ? '' : 's'}${possible_count ? ` and ${possible_count} possible exposure${possible_count === 1 ? '' : 's'}` : ''}.`
        : `No confirmed restriction conflict was found, but ${possible_count} possible exposure${possible_count === 1 ? '' : 's'} remain because the product composition evidence is incomplete or stale.`
    return {
      status: 'flags_found',
      mode: 'personalized',
      summary,
      checked_scope,
      risk_flags,
      required_restrictions: [...new Set(required_restrictions)],
      missing_information,
      limitations,
    }
  }

  if (missing_information.length > 0) {
    return {
      status: 'insufficient_data',
      mode: 'personalized',
      summary: 'The available verified composition facts are incomplete or stale, so the requested restrictions cannot be cleared.',
      checked_scope,
      risk_flags: [],
      required_restrictions: [],
      missing_information,
      limitations,
    }
  }

  return {
    status: 'no_flags_detected',
    mode: 'personalized',
    summary:
      'No exact conflict was found between the complete current verified product facts and the permitted allergen or avoided-ingredient restrictions.',
    checked_scope,
    risk_flags: [],
    required_restrictions: [],
    missing_information: [],
    limitations,
  }
}

export const medic_missing_composition_assessment = (): medic_assessment => ({
  status: 'insufficient_data',
  mode: 'personalized',
  summary: 'A verified active ingredient and allergen record is required for the exact product variant.',
  checked_scope: [],
  risk_flags: [],
  required_restrictions: [],
  missing_information: ['Verified active ingredient and allergen facts for the exact product variant'],
  limitations: ['Product facts from an unresolved, unverified, or different variant were not used for this check.'],
})

/**
 * Captures only the already-permitted profile in a server-side closure. The model
 * never supplies a user ID, restriction values, or a product identity other than
 * the Detective-resolved barcode.
 */
export const create_medic_restriction_checker_tool = (profile: medic_profile, dependency: medic_restriction_checker_dependency = service_product) =>
  createTool({
    name: 'tool_medic_restriction_checker',
    description:
      'Compare one resolved product barcode against the already permitted allergen and avoided-ingredient restrictions using only active verified product facts.',
    parameters: dto_tool_medic_restriction_checker.check,
    outputSchema: dto_tool_medic_restriction_checker.result,
    execute: async ({ barcode }) => {
      const composition_result = await dependency.find_composition_by_barcode({ barcode })
      if (!composition_result.data) return medic_missing_composition_assessment()

      const composition = dto_tool_medic_restriction_checker.composition.parse(composition_result.data)
      return assess_medic_restrictions(profile, composition)
    },
  })
