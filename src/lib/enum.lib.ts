export const enum_otp_action = ['sign_in', 'sign_up'] as const

export const enum_gender = ['male', 'female'] as const

export const enum_tenant_type = ['user', 'organization'] as const

export const enum_morocco_city = [
  'tangier',
  'tetouan',
  'fnideq',
  'martil',
  'cabo_negro',
  'm_diq',
  'larache',
  'asilah',
  'chefchaouen',
  'al_hoceima',
  'saidia',
  'kenitra',
  'rabat',
  'sale',
  'temara',
  'mohammedia',
  'casablanca',
  'el_jadida',
  'safi',
  'essaouira',
  'oujda',
  'fez',
  'meknes',
  'errachidia',
  'settat',
  'khouribga',
  'beni_mellal',
  'marrakesh',
  'agadir',
  'ouarzazate',
  'guelmim',
  'laayoune',
  'smara',
  'dakhla',
] as const

export const enum_country = ['morocco'] as const

export const enum_access_action = ['full_access'] as const

export const enum_product_type = ['food'] as const

export const enum_scan_source = ['cache', 'provider'] as const

export const enum_user_list_type = ['whitelist', 'blacklist'] as const

export const enum_nova_group = [1, 2, 3, 4] as const

export const enum_ecoscore = ['a', 'b', 'c', 'd', 'e'] as const

export const enum_nutriscore = ['a', 'b', 'c', 'd', 'e'] as const

export const enum_boycott_decision_status = ['boycott', 'not_boycotted', 'unknown', 'needs_review'] as const

export const enum_boycott_entity_type = ['product', 'brand', 'company'] as const

export const enum_boycott_claim_type = ['boycott_target', 'ownership', 'alternative', 'risk_evidence', 'neutral_reference'] as const

export const enum_boycott_claim_status = ['active', 'inactive', 'unknown'] as const

export const enum_boycott_relationship_type = [
  'owned_by',
  'parent_company',
  'subsidiary_of',
  'alternative_to',
  'same_as',
  'franchisee_of',
  'distributed_by',
] as const

export const enum_boycott_source_type = ['csv', 'json', 'yaml', 'html', 'manual', 'api', 'pdf'] as const

export const enum_boycott_campaign_tier = ['priority', 'organic', 'pressure', 'evidence', 'community'] as const

export const enum_boycott_match_type = ['exact', 'alias', 'website', 'fuzzy', 'related_entity', 'none'] as const
