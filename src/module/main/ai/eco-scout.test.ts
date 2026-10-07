import { describe, expect, it } from 'bun:test'

import { adapter_eco_scout } from '@ai/adapter/eco-scout.adapter.ai'
import { build_consumer_result } from '@ai/execution/execution-result.ai'
import { schema_agent_detective } from '@agent/detective/detective.schema.agent'
import { schema_agent_dispatcher } from '@agent/dispatcher/dispatcher.schema.agent'
import { build_eco_scout_report } from '@agent/eco-scout/eco-scout.agent'

const budgets = {
  timeout_ms: 10_000,
  max_tool_calls: 4,
  max_retries: 0,
  max_alternative_candidates: 0,
  max_candidate_review_passes: 0,
  max_response_repairs: 0,
}

const detective_product = (
  ecoscore: 'a' | 'b' | 'c' | 'd' | 'e' | null,
  packaging: { materials: string[]; recycling_instructions: string[] } | null = null,
) =>
  schema_agent_detective.parse({
    status: 'identified',
    query_type: 'product',
    found: true,
    subject: {
      type: 'product',
      source: 'open_food_facts',
      name: 'Example Cola 330 ml',
      barcode: '5449000054227',
      brand_name: 'Example Cola',
      brand_candidates: ['Example Cola'],
    },
    selection: { required: false, options: [], total_options: 0 },
    related_products: {
      relation: 'product_matches',
      items: [
        {
          source: 'open_food_facts',
          product_id: null,
          barcode: '5449000054227',
          type: 'beverage',
          name: 'Example Cola 330 ml',
          brand_name: 'Example Cola',
          brand_candidates: ['Example Cola'],
          images: [],
          nova_group: null,
          ecoscore,
          retrieved_at: '2026-10-05T10:00:00.000Z',
          nutriscore: null,
          ingredients: null,
          allergens: null,
          packaging,
          nutrition: null,
        },
      ],
      total: 1,
      page: 1,
      page_size: 1,
      has_more: false,
    },
    sources_checked: ['open_food_facts'],
    message: 'Product identified.',
  })

const run_eco_scout = (detective: unknown) =>
  adapter_eco_scout(
    {
      prompt: 'What is this product environmental impact?',
      execution_id: crypto.randomUUID(),
      dependencies: { Detective: { status: 'completed', output: detective, limitations: [] } },
      candidate_review: null,
      budgets,
      use_tool: async (call) => await call(),
      inspect_content: async (text) => text,
    },
    new AbortController().signal,
  )

describe('Eco Scout', () => {
  it('publishes exact-product Eco-Score evidence with product scope', async () => {
    const result = await run_eco_scout(detective_product('b'))

    expect(result.status).toBe('completed')
    expect(result.output).toMatchObject({
      status: 'available',
      evidence_scope: 'product',
      indicators: [{ kind: 'eco_score', value: 'b', scope: 'product' }],
      sources: [{ provider: 'open_food_facts', url: null }],
    })
    expect(result.limitations.join(' ')).toContain('not a carbon, water, lifecycle')
  })

  it('keeps the requested environmental check incomplete when the exact variant has no supported environmental facts', async () => {
    const result = await run_eco_scout(detective_product(null))

    expect(result.status).toBe('partial')
    expect(result.output).toMatchObject({
      status: 'partial',
      evidence_scope: 'none',
      indicators: [],
      missing_information: [
        'A verified product-specific Eco-Score for the exact variant.',
        'Product-specific packaging material or recycling instruction data.',
      ],
    })
    expect(result.limitations).toContain('No product-specific Eco-Score or packaging data is available for this exact variant in Open Food Facts.')
  })

  it('publishes reported packaging tags without claiming they prove environmental impact', async () => {
    const result = await run_eco_scout(
      detective_product(null, { materials: ['plastic', 'aluminium'], recycling_instructions: ['recycle', 'discard'] }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        status: 'available',
        evidence_scope: 'product',
        indicators: [
          { kind: 'packaging_material', value: 'plastic' },
          { kind: 'packaging_material', value: 'aluminium' },
          { kind: 'packaging_recycling_instruction', value: 'recycle' },
          { kind: 'packaging_recycling_instruction', value: 'discard' },
        ],
      },
    })
    expect(result.limitations.join(' ')).toContain('do not establish recycled content')
  })

  it('does not use a brand as environmental evidence for a product', async () => {
    const detective = schema_agent_detective.parse({
      status: 'identified',
      query_type: 'brand',
      found: true,
      subject: { type: 'brand', source: 'local_database', name: 'Example Cola', brand_id: 1 },
      selection: { required: false, options: [], total_options: 0 },
      related_products: { relation: 'none', items: [], total: 0, page: 1, page_size: 0, has_more: false },
      sources_checked: ['local_database'],
      message: 'Brand identified.',
    })

    const result = await run_eco_scout(detective)

    expect(result).toEqual({
      status: 'needs_input',
      output: null,
      limitations: ['Eco Scout requires an exact product variant or barcode. Brand-level evidence is not used as product environmental evidence.'],
    })
  })

  it('requires Detective to complete before Eco Scout runs', async () => {
    const result = await adapter_eco_scout(
      {
        prompt: 'What is this product environmental impact?',
        execution_id: crypto.randomUUID(),
        dependencies: { Detective: { status: 'needs_input', output: null, limitations: ['Choose a product.'] } },
        candidate_review: null,
        budgets,
        use_tool: async (call) => await call(),
        inspect_content: async (text) => text,
      },
      new AbortController().signal,
    )

    expect(result).toEqual({
      status: 'needs_input',
      output: null,
      limitations: ['Eco Scout requires Detective to resolve an exact product variant first.'],
    })
  })

  it('requires Detective to provide facts for the resolved exact variant', async () => {
    const detective = detective_product('a')
    detective.related_products.items = []

    const result = await run_eco_scout(detective)

    expect(result).toEqual({
      status: 'needs_review',
      output: null,
      limitations: ['Eco Scout could not find the resolved exact variant in Detective’s verified product facts.'],
    })
  })

  it('asks for review instead of failing when the resolved barcode is not a product code', async () => {
    const detective = detective_product('a')
    if (detective.subject?.type === 'product') detective.subject.barcode = 'ABC-123'
    detective.related_products.items[0]!.barcode = 'ABC-123'

    const result = await run_eco_scout(detective)

    expect(result).toEqual({
      status: 'needs_review',
      output: null,
      limitations: ['Eco Scout could not verify the resolved product barcode, so it did not publish environmental evidence for it.'],
    })
  })

  it('treats blank catalog names as missing instead of failing', async () => {
    const detective = detective_product('b')
    detective.related_products.items[0]!.name = ' '
    detective.related_products.items[0]!.brand_name = ''

    const result = await run_eco_scout(detective)

    expect(result.status).toBe('completed')
    expect(result.output).toMatchObject({ subject: { product_name: null, brand_name: null } })
  })

  it('preserves Detective retrieval time without representing it as source freshness', () => {
    const report = build_eco_scout_report({
      product: {
        source: 'local_database',
        barcode: '5449000054227',
        name: 'Example Cola 330 ml',
        brand_name: 'Example Cola',
        ecoscore: 'c',
        retrieved_at: '2026-10-05T10:00:00.000Z',
      },
    })

    expect(report.sources).toEqual([{ provider: 'local_database', url: null, retrieved_at: '2026-10-05T10:00:00.000Z' }])
    expect(report.limitations.join(' ')).toContain('not the publication or freshness date of the environmental facts')
  })

  it('does not invent a source retrieval time when Detective did not provide one', () => {
    const report = build_eco_scout_report({
      product: {
        source: 'local_database',
        barcode: '5449000054227',
        name: 'Example Cola 330 ml',
        brand_name: 'Example Cola',
        ecoscore: 'c',
        retrieved_at: null,
      },
    })

    expect(report.status).toBe('partial')
    expect(report.sources).toEqual([])
    expect(report.missing_information).toEqual([
      'Product-specific packaging material or recycling instruction data.',
      'The time Detective retrieved this catalog fact.',
    ])
  })

  it('adds Eco Scout evidence to the public assessment and source registry', () => {
    const detective = detective_product('a')
    const eco_scout = build_eco_scout_report({
      product: {
        source: 'open_food_facts',
        barcode: '5449000054227',
        name: 'Example Cola 330 ml',
        brand_name: 'Example Cola',
        ecoscore: 'a',
        retrieved_at: '2026-10-05T10:00:00.000Z',
      },
    })
    const dispatcher_plan = schema_agent_dispatcher.parse({
      selected_agents: [
        { agent: 'Detective', depends_on: [], run_when: 'always' },
        { agent: 'Eco Scout', depends_on: ['Detective'], run_when: 'always' },
        { agent: 'Skeptic', depends_on: ['Detective', 'Eco Scout'], run_when: 'always' },
        { agent: 'Referee', depends_on: ['Skeptic'], run_when: 'always' },
        { agent: 'Storyteller', depends_on: ['Skeptic', 'Referee'], run_when: 'always' },
        { agent: 'Gatekeeper', depends_on: ['Storyteller'], run_when: 'always' },
      ],
      required_checks: ['identity', 'environment', 'evidence', 'hard_constraints', 'final_response'],
      budgets: { ...budgets },
      untrusted_content_policy: 'bait_tester_before_consumption',
      candidate_validation: 'not_requested',
    })
    const result = build_consumer_result(
      {
        prompt: 'What is this product Eco-Score?',
        user_id: 1,
        execution_id: crypto.randomUUID(),
        bodyguard: { safe: true, action: 'allow', riskLevel: 'none', risks: [], reason: 'Allowed', confidence: 1 },
        plan: null,
        dispatcher_plan,
        agent_results: {
          Detective: { status: 'completed', output: detective, limitations: [] },
          'Eco Scout': { status: 'completed', output: eco_scout, limitations: eco_scout.limitations },
        },
        candidate_review: null,
      },
      {
        specialists: {
          Detective: async () => ({ status: 'completed', output: null, limitations: [] }),
          'Eco Scout': async () => ({ status: 'completed', output: null, limitations: [] }),
        },
      },
    )

    expect(result.assessments.find((assessment) => assessment.agent === 'Eco Scout')).toMatchObject({
      status: 'completed',
      source_ids: ['eco-scout-source-1'],
    })
    expect(result.sources).toEqual([
      {
        id: 'eco-scout-source-1',
        provider: 'Open Food Facts',
        url: null,
        retrieved_at: '2026-10-05T10:00:00.000Z',
      },
    ])
  })
})
