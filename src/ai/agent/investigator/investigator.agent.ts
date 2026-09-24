import type {
  type_input_agent_investigator,
  type_query_agent_investigator,
  type_schema_agent_investigator,
} from '@agent/investigator/investigator.schema.agent'

import { Agent } from '@voltagent/core'
import { Output } from 'ai'

import { trusted_agent_generation_options } from '@ai/generation.ai'
import { ai_google, ai_google_default_model } from '@ai/provider.ai'
import { prompt_agent_investigator } from '@agent/investigator/investigator.prompt.agent'
import {
  schema_agent_investigator,
  schema_extracted_subject_agent_investigator,
  schema_input_agent_investigator,
  schema_query_agent_investigator,
} from '@agent/investigator/investigator.schema.agent'

import { service_boycott_decision } from '@module/main/boycott-decision/boycott-decision.service'
import { service_boycott_provider } from '@module/main/boycott-provider/boycott-provider.service'

type investigator_check = type_schema_agent_investigator['checks'][number]
type local_decision = Awaited<ReturnType<typeof service_boycott_decision.decide>>['data']
type boycat_decision = Awaited<ReturnType<typeof service_boycott_provider.decide>>['data']

export type investigator_runtime = {
  use_tool: <T>(call: () => Promise<T>) => Promise<T>
  inspect_content: (text: string) => Promise<string>
}

export const $agent_investigator = new Agent({
  id: 'investigator',
  name: 'Ztroop Investigator',
  purpose: 'Gather and summarize sourced boycott and related-entity evidence without making a final verdict',
  instructions: prompt_agent_investigator,
  model: ai_google(process.env.AI_INVESTIGATOR_MODEL || ai_google_default_model),
  tools: [],
  memory: false,
})

function normalize_entity_text(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function resolve_brand_candidates(subject: type_input_agent_investigator): string[] {
  const names = [subject.brand_name, ...(subject.brand_candidates ?? [])]
  const candidates: string[] = []
  const keys = new Set<string>()

  for (const value of names) {
    if (!value) continue
    for (const part of value.split(/[,;|]/)) {
      const name = part.trim()
      const key = normalize_entity_text(name)
      if (!name || !key || keys.has(key)) continue
      keys.add(key)
      candidates.push(name)
      if (candidates.length === 5) return candidates
    }
  }
  return candidates
}

function unique_brand_names(names: Array<string | null | undefined>): string[] {
  const result: string[] = []
  const keys = new Set<string>()
  for (const name of names) {
    if (!name) continue
    const key = normalize_entity_text(name)
    if (!key || keys.has(key)) continue
    keys.add(key)
    result.push(name)
  }
  return result
}

async function resolve_investigator_input(
  input: type_input_agent_investigator | type_query_agent_investigator,
  signal?: AbortSignal,
): Promise<type_input_agent_investigator> {
  if (!('query' in input)) return schema_input_agent_investigator.parse(input)

  const { query } = schema_query_agent_investigator.parse(input)
  const result = await $agent_investigator.generateText(`EXTRACT_ENTITY\n${JSON.stringify({ query })}`, {
    ...trusted_agent_generation_options,
    temperature: 0,
    output: Output.object({ schema: schema_extracted_subject_agent_investigator }),
    abortSignal: signal,
  })
  const extracted = schema_extracted_subject_agent_investigator.parse(result.output)
  const normalized_query = normalize_entity_text(query)
  const normalized_name = extracted.entity_name ? normalize_entity_text(extracted.entity_name) : ''
  const name_is_in_query = normalized_name.length > 0 && ` ${normalized_query} `.includes(` ${normalized_name} `)

  if (!name_is_in_query || extracted.entity_type === 'unknown') return { brand_name: null, brand_candidates: [] }
  if (extracted.entity_type === 'product') {
    return { brand_name: null, brand_candidates: [], product_name: extracted.entity_name ?? undefined }
  }

  return { brand_name: extracted.entity_name, brand_candidates: extracted.entity_name ? [extracted.entity_name] : [] }
}

function normalize_local_decision(result: local_decision): investigator_check {
  return {
    source: 'local_knowledge',
    status: result.matched_entity ? 'matched' : 'not_found',
    decision_status: result.decision_status,
    confidence: result.confidence,
    reason: result.reason,
    matched_entity: result.matched_entity,
    matched_path: result.matched_path,
    citations: result.sources.map((source) => ({
      source_name: source.source_name,
      source_url: source.source_url,
      title: source.title ?? null,
      url: source.url,
      quote: source.quote ?? null,
    })),
  }
}

function normalize_boycat_decision(result: boycat_decision): investigator_check {
  return {
    source: 'boycat',
    status: result.provider_status,
    decision_status: result.decision_status,
    confidence: result.confidence,
    reason: result.reason,
    matched_entity: result.matched_entity,
    matched_path: [],
    citations: result.sources.map((source) => ({
      source_name: source.source_name,
      source_url: source.source_url,
      title: source.title ?? null,
      url: source.url,
      quote: source.quote ?? null,
    })),
  }
}

function unavailable_check(source: investigator_check['source']): investigator_check {
  return {
    source,
    status: 'unavailable',
    decision_status: null,
    confidence: null,
    reason: 'The evidence service could not be reached.',
    matched_entity: null,
    matched_path: [],
    citations: [],
  }
}

function has_specific_citation(check: investigator_check): boolean {
  return check.citations.some((citation) => check.source !== 'boycat' || !/^https?:\/\/(?:www\.)?boycat\.io\/?$/i.test(citation.url))
}

function get_report_status(checks: investigator_check[]): type_schema_agent_investigator['status'] {
  const boycott = checks.some((check) => check.status === 'matched' && check.decision_status === 'boycott')
  const not_boycotted = checks.some((check) => check.status === 'matched' && check.decision_status === 'not_boycotted')
  const matched_identities = new Set(
    checks.filter((check) => check.status === 'matched' && check.matched_entity).map((check) => normalize_entity_text(check.matched_entity!.name)),
  )

  if (boycott && not_boycotted) return 'needs_review'
  if (matched_identities.size > 1) return 'needs_review'
  if (checks.some((check) => check.status === 'ambiguous')) return 'needs_review'
  if (checks.some((check) => check.status === 'matched' && has_specific_citation(check))) return 'evidence_found'
  if (checks.some((check) => check.status === 'matched')) return 'needs_review'
  if (checks.some((check) => check.status === 'unavailable' || check.status === 'invalid_response')) return 'unavailable'

  return 'no_matching_evidence'
}

function get_report_limitations(checks: investigator_check[]): string[] {
  const limitations = [
    'No matching evidence is not proof that a brand is safe.',
    'checked_at records lookup time, not the publication date or freshness of the underlying evidence.',
  ]

  if (checks.some((check) => check.source === 'local_knowledge')) {
    limitations.push('Local knowledge is a limited curated seed, not a complete ownership or boycott registry.')
  }
  if (checks.some((check) => check.status === 'unavailable' || check.status === 'invalid_response')) {
    limitations.push('At least one evidence source was unavailable or returned an invalid response.')
  }
  if (checks.some((check) => check.status === 'matched' && !has_specific_citation(check))) {
    limitations.push('At least one match has no specific supporting citation URL in the service response.')
  }
  if (checks.some((check) => check.status === 'ambiguous')) {
    limitations.push('Boycat returned multiple possible brand identities; no provider claim was assigned to an unverified match.')
  }
  const matched_identities = new Set(
    checks.filter((check) => check.status === 'matched' && check.matched_entity).map((check) => normalize_entity_text(check.matched_entity!.name)),
  )
  if (matched_identities.size > 1) {
    limitations.push('Evidence sources matched more than one distinct brand identity; the identity requires review.')
  }
  if (checks.some((check) => check.matched_entity?.match_type === 'fuzzy' || check.matched_entity?.match_type === 'related_entity')) {
    limitations.push('At least one match is fuzzy or follows a related-entity path; verify the identity before drawing conclusions.')
  }

  return limitations
}

export const agent_investigator = async (
  input: type_input_agent_investigator | type_query_agent_investigator,
  options: { include_analysis_draft?: boolean; signal?: AbortSignal; runtime?: investigator_runtime } = {},
): Promise<{ success: true; data: type_schema_agent_investigator } | { success: false; data: unknown }> => {
  try {
    options.signal?.throwIfAborted()
    const subject = await resolve_investigator_input(input, options.signal)
    const checked_at = new Date().toISOString()
    const brand_candidates = resolve_brand_candidates(subject)
    const primary_brand = brand_candidates[0] ?? null

    if (!primary_brand) {
      return {
        success: true,
        data: schema_agent_investigator.parse({
          subject: { brand_name: null, brand_candidates, product_name: subject.product_name ?? null },
          status: 'needs_input',
          checked_at,
          checks: [],
          limitations: ['A product was identified, but its brand could not be resolved for investigation.'],
          message: 'An identifiable brand is required before investigating.',
          analysis_draft: null,
        }),
      }
    }

    const run_tool = async <T>(call: () => Promise<T>) => {
      options.signal?.throwIfAborted()
      const result = options.runtime ? await options.runtime.use_tool(call) : await call()
      options.signal?.throwIfAborted()
      return result
    }
    let local_check: investigator_check
    try {
      const result = await run_tool(() =>
        service_boycott_decision.decide({
          product_brand_name: primary_brand,
          candidate_names: brand_candidates.slice(1),
        }),
      )
      local_check = normalize_local_decision(result.data)
    } catch {
      options.signal?.throwIfAborted()
      local_check = unavailable_check('local_knowledge')
    }
    const boycat_names = unique_brand_names([local_check.matched_entity?.name, primary_brand, ...brand_candidates]).slice(0, 5)
    const boycat_checks: investigator_check[] = []

    for (const brand_name of boycat_names) {
      let result: Awaited<ReturnType<typeof service_boycott_provider.decide>>
      try {
        result = await run_tool(() =>
          options.signal
            ? service_boycott_provider.decide({ provider: 'boycat', brand_name }, options.signal)
            : service_boycott_provider.decide({ provider: 'boycat', brand_name }),
        )
      } catch {
        options.signal?.throwIfAborted()
        boycat_checks.push(unavailable_check('boycat'))
        break
      }
      if (options.runtime) {
        const serialized = JSON.stringify(result.data)
        const inspected = await options.runtime.inspect_content(serialized)
        if (inspected !== serialized) throw new Error('Bait Tester changed the Boycat evidence payload')
      }
      boycat_checks.push(normalize_boycat_decision(result.data))
    }
    options.signal?.throwIfAborted()

    const checks: investigator_check[] = [local_check, ...(boycat_checks.length > 0 ? boycat_checks : [unavailable_check('boycat')])]
    const status = get_report_status(checks)
    const limitations = get_report_limitations(checks)
    const message =
      status === 'evidence_found'
        ? 'Sourced evidence was found; a separate review must assess its significance.'
        : status === 'needs_review'
          ? 'Matches were found, but the evidence or identity needs review.'
          : status === 'unavailable'
            ? 'The investigation could not check every required evidence source.'
            : 'No matching evidence was found in the checked sources.'

    let analysis_draft: string | null = null
    if (options.include_analysis_draft) {
      try {
        const result = await $agent_investigator.generateText(
          `EVIDENCE_SUMMARY\n${JSON.stringify({
            status,
            checks: checks.map((check) => ({
              source: check.source,
              status: check.status,
              decision_status: check.decision_status,
              confidence: check.confidence,
              citation_count: check.citations.length,
            })),
            limitations,
          })}`,
          { ...trusted_agent_generation_options, temperature: 0, abortSignal: options.signal },
        )
        analysis_draft = result.text.trim().slice(0, 800) || null
      } catch {
        limitations.push('The optional AI analysis draft could not be generated.')
      }
    }

    return {
      success: true,
      data: schema_agent_investigator.parse({
        subject: { brand_name: primary_brand, brand_candidates, product_name: subject.product_name ?? null },
        status,
        checked_at,
        checks,
        limitations,
        message,
        analysis_draft,
      }),
    }
  } catch (error) {
    return { success: false, data: error }
  }
}
