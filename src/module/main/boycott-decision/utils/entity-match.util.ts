import type { boycott_knowledge_item } from '@module/main/boycott-decision/source/source.types'

export type boycott_match_result = {
  item: boycott_knowledge_item
  entity_type: boycott_knowledge_item['entity']['entity_type']
  entity_name: string
  matched_name: string
  match_type: 'exact' | 'alias' | 'website' | 'fuzzy' | 'related_entity'
  match_score: number
  matched_path: string[]
}

const corporate_suffixes = ['company', 'corporation', 'corp', 'inc', 'incorporated', 'ltd', 'limited', 'llc', 'plc', 'group', 'ag', 'sa']

export function normalize_entity_name(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((part) => part.length > 0 && !corporate_suffixes.includes(part))
    .join(' ')
    .trim()
}

function get_domain(value: string | null | undefined): string | null {
  if (!value) return null

  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return (
      value
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0]
        ?.trim()
        .toLowerCase() || null
    )
  }
}

function dice_similarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const pairs = (value: string) => {
    const result = new Map<string, number>()
    for (let i = 0; i < value.length - 1; i += 1) {
      const pair = value.slice(i, i + 2)
      result.set(pair, (result.get(pair) || 0) + 1)
    }
    return result
  }

  const a_pairs = pairs(a)
  const b_pairs = pairs(b)
  let intersection = 0

  for (const [pair, count] of a_pairs) {
    const b_count = b_pairs.get(pair) || 0
    intersection += Math.min(count, b_count)
  }

  return (2 * intersection) / (a.length - 1 + b.length - 1)
}

function compare_names(candidate: string, target: string, is_alias = false): boycott_match_result['match_type'] | null {
  const normalized_candidate = normalize_entity_name(candidate)
  const normalized_target = normalize_entity_name(target)

  if (!normalized_candidate || !normalized_target) return null
  if (normalized_candidate === normalized_target) return is_alias ? 'alias' : 'exact'

  return null
}

function score_fuzzy(candidate: string, target: string): number {
  const normalized_candidate = normalize_entity_name(candidate)
  const normalized_target = normalize_entity_name(target)
  if (!normalized_candidate || !normalized_target) return 0

  const similarity = dice_similarity(normalized_candidate, normalized_target)
  if (similarity >= 0.82) return 72
  if (similarity >= 0.72) return 58

  return 0
}

export function find_best_knowledge_match(options: {
  items: boycott_knowledge_item[]
  candidate_names: string[]
  website_url?: string
}): boycott_match_result | null {
  const { items, candidate_names, website_url } = options
  const input_domain = get_domain(website_url)
  const matches: boycott_match_result[] = []

  for (const item of items) {
    const entity_names = [item.entity.name, ...item.entity.aliases]
    const entity_domain = get_domain(item.entity.website_url)

    if (input_domain && entity_domain && input_domain === entity_domain) {
      matches.push({
        item,
        entity_type: item.entity.entity_type,
        entity_name: item.entity.name,
        matched_name: item.entity.website_url || item.entity.name,
        match_type: 'website',
        match_score: 90,
        matched_path: [`input website:${input_domain}`, `${item.entity.entity_type}:${item.entity.name}`],
      })
    }

    for (const candidate of candidate_names) {
      for (const [index, name] of entity_names.entries()) {
        const name_match = compare_names(candidate, name, index > 0)
        if (name_match) {
          matches.push({
            item,
            entity_type: item.entity.entity_type,
            entity_name: item.entity.name,
            matched_name: name,
            match_type: name_match,
            match_score: name_match === 'exact' ? 100 : 95,
            matched_path: [`input:${candidate}`, `${item.entity.entity_type}:${item.entity.name}`],
          })
        }

        const fuzzy_score = score_fuzzy(candidate, name)
        if (fuzzy_score > 0) {
          matches.push({
            item,
            entity_type: item.entity.entity_type,
            entity_name: item.entity.name,
            matched_name: name,
            match_type: 'fuzzy',
            match_score: fuzzy_score,
            matched_path: [`input:${candidate}`, `${item.entity.entity_type}:${item.entity.name}`],
          })
        }
      }

      for (const related_entity of item.related_entities) {
        const related_names = [related_entity.name, ...(related_entity.aliases || [])]
        const related_domain = get_domain(related_entity.website_url)

        if (input_domain && related_domain && input_domain === related_domain) {
          matches.push({
            item,
            entity_type: related_entity.entity_type,
            entity_name: related_entity.name,
            matched_name: related_entity.website_url || related_entity.name,
            match_type: 'related_entity',
            match_score: 86,
            matched_path: [
              `input website:${input_domain}`,
              `${related_entity.entity_type}:${related_entity.name}`,
              `${related_entity.relationship_type}:${item.entity.name}`,
            ],
          })
        }

        for (const [index, name] of related_names.entries()) {
          const name_match = compare_names(candidate, name, index > 0)
          if (name_match) {
            matches.push({
              item,
              entity_type: related_entity.entity_type,
              entity_name: related_entity.name,
              matched_name: name,
              match_type: 'related_entity',
              match_score: name_match === 'exact' ? 88 : 84,
              matched_path: [
                `input:${candidate}`,
                `${related_entity.entity_type}:${related_entity.name}`,
                `${related_entity.relationship_type}:${item.entity.name}`,
              ],
            })
          }
        }
      }
    }
  }

  return matches.sort((a, b) => b.match_score - a.match_score)[0] || null
}
