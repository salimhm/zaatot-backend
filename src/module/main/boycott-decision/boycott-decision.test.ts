import { describe, expect, it } from 'bun:test'

import { service_boycott_decision } from '@module/main/boycott-decision/boycott-decision.service'

describe('Boycott Decision Service', () => {
  it('should return boycott for an exact brand match', async () => {
    const result = await service_boycott_decision.decide({
      product_brand_name: 'Coca Cola',
    })

    expect(result.data.decision_status).toBe('boycott')
    expect(result.data.confidence).toBeGreaterThanOrEqual(80)
    expect(result.data.sources.length).toBeGreaterThan(0)
    expect(result.data.alternatives.length).toBeGreaterThan(0)
  })

  it('should return boycott for an alias match', async () => {
    const result = await service_boycott_decision.decide({
      product_brand_name: 'Coke',
    })

    expect(result.data.decision_status).toBe('boycott')
    expect(result.data.matched_entity?.matched_name).toBe('Coke')
  })

  it('should return boycott for a related company match', async () => {
    const result = await service_boycott_decision.decide({
      product_company_name: 'HPE',
    })

    expect(result.data.decision_status).toBe('boycott')
    expect(result.data.matched_path.join(' ')).toContain('Hewlett Packard')
  })

  it('should return needs_review for lower-trust community evidence', async () => {
    const result = await service_boycott_decision.decide({
      product_company_name: 'Cellebrite',
    })

    expect(result.data.decision_status).toBe('needs_review')
    expect(result.data.confidence).toBeLessThan(80)
    expect(result.data.alternatives.length).toBeGreaterThan(0)
  })

  it('should return not_boycotted for a known neutral seed entity', async () => {
    const result = await service_boycott_decision.decide({
      product_brand_name: 'Adirondack',
    })

    expect(result.data.decision_status).toBe('not_boycotted')
  })

  it('should return unknown for an unknown brand', async () => {
    const result = await service_boycott_decision.decide({
      product_brand_name: 'Completely Unknown Brand',
    })

    expect(result.data.decision_status).toBe('unknown')
    expect(result.data.matched_entity).toBeNull()
  })
})
