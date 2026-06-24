import type { boycott_knowledge_item } from '@module/main/boycott-decision/source/source.types'

export const boycott_decision_seed: boycott_knowledge_item[] = [
  {
    source: {
      source_id: 'bds_corporate_targeting_guide',
      source_name: 'BDS Movement Corporate Targeting Guide',
      source_url: 'https://bdsmovement.net/Guide-to-BDS-Boycott',
      source_type: 'html',
      trust_score: 95,
    },
    entity: {
      entity_type: 'brand',
      name: 'Coca Cola',
      aliases: ['Coca-Cola', 'Coke', 'The Coca-Cola Company'],
      website_url: 'https://www.coca-cola.com/',
      category_tags: ['beverages', 'soft-drinks'],
    },
    claim: {
      claim_type: 'boycott_target',
      status: 'active',
      tier: 'organic',
      reason: 'Listed by the BDS Movement under grassroots organic boycott targets supported due to alleged company or branch/franchisee complicity.',
    },
    related_entities: [
      {
        relationship_type: 'owned_by',
        entity_type: 'company',
        name: 'The Coca-Cola Company',
        aliases: ['Coca-Cola Company'],
        website_url: 'https://www.coca-colacompany.com/',
      },
    ],
    evidence: [
      {
        title: 'Guide to BDS Boycott & Pressure Corporate Priority Targeting',
        url: 'https://bdsmovement.net/Guide-to-BDS-Boycott',
      },
    ],
    alternatives: [
      { name: 'Adirondack', description: 'Alternative cola and soft drink brand' },
      { name: 'Barr Soda', description: 'Alternative soda brand' },
      { name: 'C and C Cola', description: 'Alternative cola brand' },
    ],
    confidence: 92,
  },
  {
    source: {
      source_id: 'bds_corporate_targeting_guide',
      source_name: 'BDS Movement Corporate Targeting Guide',
      source_url: 'https://bdsmovement.net/Guide-to-BDS-Boycott',
      source_type: 'html',
      trust_score: 95,
    },
    entity: {
      entity_type: 'brand',
      name: 'Carrefour',
      aliases: ['Carrefour Group', 'Carrefour Israel'],
      website_url: 'https://www.carrefour.com/',
      category_tags: ['retail', 'grocery'],
    },
    claim: {
      claim_type: 'boycott_target',
      status: 'active',
      tier: 'priority',
      reason: 'Listed by the BDS Movement as a consumer boycott priority target due to franchise and retail links cited in the campaign guide.',
    },
    related_entities: [
      {
        relationship_type: 'franchisee_of',
        entity_type: 'company',
        name: 'Electra Consumer Products',
        aliases: ['Electra Retail', 'Yenot Bitan'],
      },
    ],
    evidence: [
      {
        title: 'Guide to BDS Boycott & Pressure Corporate Priority Targeting',
        url: 'https://bdsmovement.net/Guide-to-BDS-Boycott',
      },
    ],
    alternatives: [{ name: 'Local grocery retailers', description: 'Prefer independent or locally owned grocery retailers when available' }],
    confidence: 94,
  },
  {
    source: {
      source_id: 'bds_corporate_targeting_guide',
      source_name: 'BDS Movement Corporate Targeting Guide',
      source_url: 'https://bdsmovement.net/Guide-to-BDS-Boycott',
      source_type: 'html',
      trust_score: 95,
    },
    entity: {
      entity_type: 'company',
      name: 'Hewlett Packard',
      aliases: ['HP', 'HP Inc', 'HPE', 'Hewlett Packard Enterprise'],
      website_url: 'https://www.hp.com/',
      category_tags: ['technology', 'hardware', 'software'],
    },
    claim: {
      claim_type: 'boycott_target',
      status: 'active',
      tier: 'priority',
      reason: 'Listed by the BDS Movement guide among boycott targets connected to technology services and systems cited by the campaign.',
    },
    related_entities: [
      {
        relationship_type: 'same_as',
        entity_type: 'company',
        name: 'Hewlett Packard Enterprise',
        aliases: ['HPE'],
        website_url: 'https://www.hpe.com/',
      },
      {
        relationship_type: 'same_as',
        entity_type: 'company',
        name: 'HP Inc',
        aliases: ['HP'],
        website_url: 'https://www.hp.com/',
      },
    ],
    evidence: [
      {
        title: 'Guide to BDS Boycott & Pressure Corporate Priority Targeting',
        url: 'https://bdsmovement.net/Guide-to-BDS-Boycott',
      },
    ],
    alternatives: [{ name: 'Framework', website_url: 'https://frame.work/', description: 'Repairable laptop manufacturer' }],
    confidence: 91,
  },
  {
    source: {
      source_id: 'bds_corporate_targeting_guide',
      source_name: 'BDS Movement Corporate Targeting Guide',
      source_url: 'https://bdsmovement.net/Guide-to-BDS-Boycott',
      source_type: 'html',
      trust_score: 95,
    },
    entity: {
      entity_type: 'company',
      name: 'Chevron',
      aliases: ['Caltex', 'Texaco', 'Chevron Corporation'],
      website_url: 'https://www.chevron.com/',
      category_tags: ['energy', 'fuel'],
    },
    claim: {
      claim_type: 'boycott_target',
      status: 'active',
      tier: 'priority',
      reason: 'Listed by the BDS Movement as a consumer boycott priority target, including Chevron, Caltex and Texaco brands.',
    },
    related_entities: [
      { relationship_type: 'same_as', entity_type: 'brand', name: 'Caltex', aliases: ['Caltex Energy'] },
      { relationship_type: 'same_as', entity_type: 'brand', name: 'Texaco', aliases: ['Texaco Gas'] },
    ],
    evidence: [
      {
        title: 'Guide to BDS Boycott & Pressure Corporate Priority Targeting',
        url: 'https://bdsmovement.net/Guide-to-BDS-Boycott',
      },
    ],
    alternatives: [{ name: 'Public transit or local fuel alternatives', description: 'Use practical local alternatives where possible' }],
    confidence: 93,
  },
  {
    source: {
      source_id: 'bds_corporate_targeting_guide',
      source_name: 'BDS Movement Corporate Targeting Guide',
      source_url: 'https://bdsmovement.net/Guide-to-BDS-Boycott',
      source_type: 'html',
      trust_score: 95,
    },
    entity: {
      entity_type: 'company',
      name: 'Siemens',
      aliases: ['Siemens AG'],
      website_url: 'https://www.siemens.com/',
      category_tags: ['technology', 'energy', 'appliances'],
    },
    claim: {
      claim_type: 'boycott_target',
      status: 'active',
      tier: 'priority',
      reason: 'Listed by the BDS Movement guide as a target linked to infrastructure and energy projects cited by the campaign.',
    },
    related_entities: [],
    evidence: [
      {
        title: 'Guide to BDS Boycott & Pressure Corporate Priority Targeting',
        url: 'https://bdsmovement.net/Guide-to-BDS-Boycott',
      },
    ],
    alternatives: [{ name: 'Local appliance alternatives', description: 'Prefer non-targeted appliance brands where practical' }],
    confidence: 90,
  },
  {
    source: {
      source_id: 'opensanctions_ohchr_settlement',
      source_name: 'OpenSanctions OHCHR Settlement Database',
      source_url: 'https://data.opensanctions.org/datasets/latest/ps_ohchr_settlement/index.json',
      source_type: 'api',
      trust_score: 90,
    },
    entity: {
      entity_type: 'company',
      name: 'Motorola Solutions',
      aliases: ['Motorola Solutions, Inc.', 'Motorola Solutions Israel Ltd.'],
      website_url: 'https://www.motorolasolutions.com/',
      category_tags: ['technology', 'security'],
    },
    claim: {
      claim_type: 'risk_evidence',
      status: 'active',
      tier: 'evidence',
      reason: 'Appears in the OpenSanctions mirror of the OHCHR list of companies linked to illegal settlement activity.',
    },
    related_entities: [
      {
        relationship_type: 'subsidiary_of',
        entity_type: 'company',
        name: 'Motorola Solutions Israel Ltd.',
        aliases: ['Motorola Solutions Israel'],
      },
    ],
    evidence: [
      {
        title: 'OHCHR List of Companies Linked to Illegal Settlement in the West Bank',
        url: 'https://data.opensanctions.org/datasets/latest/ps_ohchr_settlement/index.json',
      },
    ],
    alternatives: [],
    confidence: 88,
  },
  {
    source: {
      source_id: 'opensanctions_ohchr_settlement',
      source_name: 'OpenSanctions OHCHR Settlement Database',
      source_url: 'https://data.opensanctions.org/datasets/latest/ps_ohchr_settlement/index.json',
      source_type: 'api',
      trust_score: 90,
    },
    entity: {
      entity_type: 'company',
      name: 'TripAdvisor',
      aliases: ['TripAdvisor, Inc.', 'Tripadvisor'],
      website_url: 'https://www.tripadvisor.com/',
      category_tags: ['travel', 'hospitality'],
    },
    claim: {
      claim_type: 'risk_evidence',
      status: 'active',
      tier: 'evidence',
      reason: 'Appears in the OpenSanctions mirror of the OHCHR list of companies linked to illegal settlement activity.',
    },
    related_entities: [],
    evidence: [
      {
        title: 'OHCHR List of Companies Linked to Illegal Settlement in the West Bank',
        url: 'https://data.opensanctions.org/datasets/latest/ps_ohchr_settlement/index.json',
      },
    ],
    alternatives: [],
    confidence: 86,
  },
  {
    source: {
      source_id: 'tech_for_palestine_tech',
      source_name: 'TechForPalestine Tech Companies Dataset',
      source_url: 'https://github.com/TechForPalestine/boycott-israeli-tech-companies-dataset',
      source_type: 'yaml',
      trust_score: 70,
    },
    entity: {
      entity_type: 'company',
      name: 'Cellebrite',
      aliases: ['Cellebrite DI'],
      website_url: 'https://cellebrite.com/',
      category_tags: ['technology', 'security', 'forensics'],
    },
    claim: {
      claim_type: 'boycott_target',
      status: 'active',
      tier: 'community',
      reason: 'Listed in the TechForPalestine technology dataset with digital forensics alternatives.',
    },
    related_entities: [],
    evidence: [
      {
        title: 'TechForPalestine boycott Israeli tech companies dataset',
        url: 'https://github.com/TechForPalestine/boycott-israeli-tech-companies-dataset',
      },
    ],
    alternatives: [
      { name: 'The Sleuth Kit', website_url: 'https://www.sleuthkit.org/index.php', description: 'Digital forensics tools' },
      { name: 'Magnet Forensics', website_url: 'https://www.magnetforensics.com/', description: 'Digital investigation software' },
    ],
    confidence: 72,
  },
  {
    source: {
      source_id: 'manual_seed',
      source_name: 'Manual MVP Seed',
      source_url: 'internal://manual-seed',
      source_type: 'manual',
      trust_score: 40,
    },
    entity: {
      entity_type: 'brand',
      name: 'Adirondack',
      aliases: ['Adirondack Beverages'],
      category_tags: ['beverages', 'soft-drinks'],
    },
    claim: {
      claim_type: 'neutral_reference',
      status: 'inactive',
      tier: null,
      reason: 'Known as an alternative in seed data; no active boycott claim is currently stored for this entity.',
    },
    related_entities: [],
    evidence: [],
    alternatives: [],
    confidence: 60,
  },
]
