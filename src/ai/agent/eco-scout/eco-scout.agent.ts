import type { type_input_agent_eco_scout, type_schema_agent_eco_scout } from '@agent/eco-scout/eco-scout.schema.agent'

import { eco_scout_source_provider_label, schema_agent_eco_scout, schema_input_agent_eco_scout } from '@agent/eco-scout/eco-scout.schema.agent'

const general_limitations = [
  'Eco-Score is a product-level grade, not a carbon, water, lifecycle, or brand-wide sustainability measurement.',
  'Packaging material and recycling instruction tags describe the reported package. They do not establish recycled content, package mass, local recycling availability, or environmental impact.',
  'No verified product-specific carbon, water, or lifecycle measurement is currently connected to Eco Scout.',
]

function unique_values(values: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const key = value.trim().toLocaleLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(value.trim())
  }

  return result
}

// This role is deterministic because it only publishes product facts carried
// through Detective. A model cannot safely add environmental evidence that the
// verified catalog record did not provide.
export const build_eco_scout_report = (raw_input: type_input_agent_eco_scout): type_schema_agent_eco_scout => {
  const input = schema_input_agent_eco_scout.parse(raw_input)
  const { product } = input
  const provider = eco_scout_source_provider_label[product.source]
  const subject = {
    product_name: product.name,
    barcode: product.barcode,
    brand_name: product.brand_name,
  }
  const source = product.retrieved_at
    ? [
        {
          provider: product.source,
          url: null,
          retrieved_at: product.retrieved_at,
        },
      ]
    : []
  const timestamp_missing = product.retrieved_at === null
  const timestamp_limitation = timestamp_missing
    ? ['Detective did not provide a retrieval time for this catalog fact, so Eco Scout cannot publish a dated source.']
    : ['The source timestamp records Detective retrieval during this workflow, not the publication or freshness date of the environmental facts.']
  const materials = unique_values(product.packaging?.materials ?? [])
  const recycling_instructions = unique_values(product.packaging?.recycling_instructions ?? [])
  const indicators: type_schema_agent_eco_scout['indicators'] = [
    ...(product.ecoscore === null
      ? []
      : [
          {
            kind: 'eco_score' as const,
            label: 'Eco-Score' as const,
            value: product.ecoscore,
            scope: 'product' as const,
            evidence_ref: 'detective.related_products.exact_variant.ecoscore' as const,
          },
        ]),
    ...materials.map((value) => ({
      kind: 'packaging_material' as const,
      label: 'Packaging material' as const,
      value,
      scope: 'product' as const,
      evidence_ref: 'detective.related_products.exact_variant.packaging.materials' as const,
    })),
    ...recycling_instructions.map((value) => ({
      kind: 'packaging_recycling_instruction' as const,
      label: 'Packaging recycling instruction' as const,
      value,
      scope: 'product' as const,
      evidence_ref: 'detective.related_products.exact_variant.packaging.recycling_instructions' as const,
    })),
  ]
  const missing_information = [
    ...(product.ecoscore === null ? ['A verified product-specific Eco-Score for the exact variant.'] : []),
    ...(materials.length === 0 && recycling_instructions.length === 0 ? ['Product-specific packaging material or recycling instruction data.'] : []),
    ...(timestamp_missing ? ['The time Detective retrieved this catalog fact.'] : []),
  ]

  if (indicators.length === 0) {
    return schema_agent_eco_scout.parse({
      status: 'partial',
      subject,
      evidence_scope: 'none',
      indicators: [],
      sources: source,
      missing_information,
      limitations: [
        `No product-specific Eco-Score or packaging data is available for this exact variant in ${provider}.`,
        ...general_limitations,
        ...timestamp_limitation,
      ],
      summary: `Eco Scout identified the exact product variant but could not complete its environmental assessment because ${provider} has no connected product-specific environmental facts for it.`,
    })
  }

  const summary_parts = [
    ...(product.ecoscore === null ? [] : [`Eco-Score ${product.ecoscore.toUpperCase()}`]),
    ...(materials.length === 0 ? [] : [`${materials.length} reported packaging material${materials.length === 1 ? '' : 's'}`]),
    ...(recycling_instructions.length === 0
      ? []
      : [`${recycling_instructions.length} reported packaging recycling instruction${recycling_instructions.length === 1 ? '' : 's'}`]),
  ]

  return schema_agent_eco_scout.parse({
    status: timestamp_missing ? 'partial' : 'available',
    subject,
    evidence_scope: 'product',
    indicators,
    sources: source,
    missing_information,
    limitations: [...general_limitations, ...timestamp_limitation],
    summary: `The exact product variant has ${summary_parts.join(', ')} from ${provider}.`,
  })
}

export const agent_eco_scout = async (
  input: type_input_agent_eco_scout,
  signal?: AbortSignal,
): Promise<{ success: true; data: type_schema_agent_eco_scout } | { success: false; data: unknown }> => {
  try {
    signal?.throwIfAborted()
    const data = build_eco_scout_report(input)
    signal?.throwIfAborted()
    return { success: true, data }
  } catch (error) {
    return { success: false, data: error }
  }
}
