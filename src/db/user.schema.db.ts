import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export * from './tenant.schema.db'

export const table_scan_history = sqliteTable(
  'scan_history',
  {
    scan_history_id: integer('scan_history_id').primaryKey({ autoIncrement: true }),
    product_id: integer('product_id').notNull(),
    product_barcode: text('product_barcode', { length: 64 }).notNull(),
    scanned_at: text('scanned_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    index('scan_history_product_id_idx').on(table.product_id),
    index('scan_history_product_barcode_idx').on(table.product_barcode),
    index('scan_history_scanned_at_idx').on(table.scanned_at),
    index('scan_history_deleted_at_idx').on(table.deleted_at),
  ],
)

export const table_user_list = sqliteTable(
  'user_list',
  {
    user_list_id: integer('user_list_id').primaryKey({ autoIncrement: true }),
    product_id: integer('product_id').notNull(),
    user_list_type: text('user_list_type').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    uniqueIndex('user_list_product_id_idx')
      .on(table.product_id)
      .where(sql`deleted_at IS NULL`),
    index('user_list_type_idx').on(table.user_list_type),
    index('user_list_deleted_at_idx').on(table.deleted_at),
  ],
)

// adding by Omar Ghazi

/** Stores immutable versions of the user's minimized product-fit preferences in the private user database. */
export const table_product_fit_profile = sqliteTable(
  'product_fit_profile',
  {
    product_fit_profile_id: integer('product_fit_profile_id').primaryKey({ autoIncrement: true }),
    // Increases whenever decision-relevant profile information changes.
    profile_version: integer('profile_version').notNull(),
    // Stores normalized allergen codes declared by the user.
    profile_allergies: text('profile_allergies', { mode: 'json' })
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'`),
    // Stores normalized diet codes such as halal, vegan, or vegetarian.
    profile_diets: text('profile_diets', { mode: 'json' })
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'`),
    // Stores normalized ingredient codes the user explicitly wants to avoid.
    profile_avoided_ingredients: text('profile_avoided_ingredients', { mode: 'json' })
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'`),
    // Stores normalized nutrition or shopping goal codes used by fit scoring.
    profile_goals: text('profile_goals', { mode: 'json' })
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'`),
    // Stores non-mandatory preference codes that can influence ranking but not safety gates.
    profile_preferences: text('profile_preferences', { mode: 'json' })
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'`),
    // Stores structured budget limits or price preferences without unrestricted personal text.
    profile_budget: text('profile_budget', { mode: 'json' }).$type<Record<string, unknown>>(),
    // Identifies the user's selected ethical or boycott-policy preference.
    profile_ethics_policy: text('profile_ethics_policy', { length: 64 }),
    // Stores a non-reversible digest used to bind decisions and invalidate personalized caches.
    profile_hash: text('profile_hash', { length: 128 }).notNull(),
    // Records when this profile revision became valid for new decisions.
    effective_at: text('effective_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    // Records when a newer profile revision replaced this one; null means it is current.
    superseded_at: text('superseded_at'),
    // Records when this profile revision was persisted.
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    // Supports controlled soft deletion without erasing historical decision references.
    deleted_at: text('deleted_at'),
  },
  (table) => [
    uniqueIndex('product_fit_profile_version_idx').on(table.profile_version),
    index('product_fit_profile_hash_idx').on(table.profile_hash),
    index('product_fit_profile_superseded_at_idx').on(table.superseded_at),
    index('product_fit_profile_deleted_at_idx').on(table.deleted_at),
  ],
)

/** Stores versioned grants and withdrawals for personalized product-fit processing in the private user database. */
export const table_product_fit_consent = sqliteTable(
  'product_fit_consent',
  {
    // Uniquely identifies this consent record.
    product_fit_consent_id: integer('product_fit_consent_id').primaryKey({ autoIncrement: true }),
    // Names the allowed processing purpose, such as personalized_product_fit.
    consent_purpose: text('consent_purpose', { length: 64 }).notNull(),
    // Stores the current state of this record, such as granted, withdrawn, or expired.
    consent_status: text('consent_status', { length: 32 }).notNull(),
    // Increases for every consent change within the same purpose.
    consent_version: integer('consent_version').notNull(),
    // References the profile revision covered by this consent when personalization is enabled.
    product_fit_profile_id: integer('product_fit_profile_id'),
    // Duplicates the covered profile version for durable audit and compatibility checks.
    profile_version: integer('profile_version'),
    // Stores a non-reversible digest of the consent terms and covered profile scope.
    consent_hash: text('consent_hash', { length: 128 }).notNull(),
    // Records when this consent version begins to authorize or deny processing.
    effective_at: text('effective_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    // Records an optional automatic expiration time for this consent.
    expires_at: text('expires_at'),
    // Records when the user explicitly withdrew the consent.
    withdrawn_at: text('withdrawn_at'),
    // Records when this consent version was persisted.
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    // Supports controlled soft deletion while preserving consent history.
    deleted_at: text('deleted_at'),
  },
  (table) => [
    uniqueIndex('product_fit_consent_purpose_version_idx').on(table.consent_purpose, table.consent_version),
    index('product_fit_consent_status_idx').on(table.consent_status),
    index('product_fit_consent_profile_id_idx').on(table.product_fit_profile_id),
    index('product_fit_consent_deleted_at_idx').on(table.deleted_at),
  ],
)

/** Stores the final deterministic product-fit outcome and the exact versions used to produce it. */
export const table_product_fit_decision = sqliteTable(
  'product_fit_decision',
  {
    product_fit_decision_id: integer('product_fit_decision_id').primaryKey({ autoIncrement: true }),
    // Prevents a retried request from creating a second logical decision.
    idempotency_key: text('idempotency_key', { length: 128 }).notNull(),
    // References the shared product evaluated by this decision.
    product_id: integer('product_id').notNull(),
    // Preserves the scanned barcode even if shared product data later changes.
    product_barcode: text('product_barcode', { length: 64 }).notNull(),
    // References the private profile revision used for personalization; null means generic mode.
    product_fit_profile_id: integer('product_fit_profile_id'),
    // Preserves the exact profile version used by the decision.
    profile_version: integer('profile_version'),
    // References the consent snapshot authorizing personalized processing.
    product_fit_consent_id: integer('product_fit_consent_id'),
    // Stores the final outcome such as recommended, qualified, not_recommended, not_sure, or blocked.
    decision_outcome: text('decision_outcome', { length: 32 }).notNull(),
    // Stores whether product identity was matched, ambiguous, or unknown.
    identity_status: text('identity_status', { length: 32 }).notNull(),
    // Stores the resolved boycott dimension without collapsing it into the final outcome.
    boycott_status: text('boycott_status', { length: 32 }).notNull(),
    // Stores the deterministic hard-safety result.
    safety_status: text('safety_status', { length: 32 }).notNull(),
    // Stores the user's goal-fit category independently from safety and boycott status.
    goal_fit_status: text('goal_fit_status', { length: 32 }).notNull(),
    // Stores the optional normalized goal-fit score when enough facts and consent are available.
    fit_score: integer('fit_score'),
    // Stores how reliable the evidence supporting the decision is, independently from fit.
    evidence_confidence: integer('evidence_confidence').notNull(),
    // Stores how much of the required evaluation successfully completed.
    evidence_coverage: integer('evidence_coverage').notNull(),
    // Stores stable machine-readable codes explaining why the outcome was selected.
    decision_reason_codes: text('decision_reason_codes', { mode: 'json' })
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'`),
    // Stores user-visible safety, evidence, or qualification warning codes.
    decision_warnings: text('decision_warnings', { mode: 'json' })
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'`),
    // Stores the verified alternative-product summaries returned with this decision.
    decision_alternatives: text('decision_alternatives', { mode: 'json' })
      .notNull()
      .$type<Record<string, unknown>[]>()
      .default(sql`'[]'`),
    // Identifies the deterministic safety and decision-rule set used.
    rules_version: text('rules_version', { length: 64 }).notNull(),
    // Identifies the weights, thresholds, freshness settings, and policy configuration used.
    config_version: text('config_version', { length: 64 }).notNull(),
    // Detects an idempotency key reused with different decision inputs.
    decision_input_hash: text('decision_input_hash', { length: 128 }).notNull(),
    // Protects the integrity of the persisted decision artifact and its material fields.
    decision_hash: text('decision_hash', { length: 128 }).notNull(),
    // Records when the final decision was committed.
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    // Supports controlled soft deletion without physically removing the audit record.
    deleted_at: text('deleted_at'),
  },
  (table) => [
    uniqueIndex('product_fit_decision_idempotency_key_idx').on(table.idempotency_key),
    index('product_fit_decision_product_id_idx').on(table.product_id),
    index('product_fit_decision_profile_id_idx').on(table.product_fit_profile_id),
    index('product_fit_decision_consent_id_idx').on(table.product_fit_consent_id),
    index('product_fit_decision_outcome_idx').on(table.decision_outcome),
    index('product_fit_decision_created_at_idx').on(table.created_at),
    index('product_fit_decision_deleted_at_idx').on(table.deleted_at),
  ],
)

/** Stores the individual sourced facts and claims that materially supported one product-fit decision. */
export const table_product_fit_decision_evidence = sqliteTable(
  'product_fit_decision_evidence',
  {
    product_fit_decision_evidence_id: integer('product_fit_decision_evidence_id').primaryKey({ autoIncrement: true }),
    // References the decision that consumed this evidence.
    product_fit_decision_id: integer('product_fit_decision_id').notNull(),
    // Classifies the evidence dimension, such as identity, boycott, ingredient, or nutrition.
    evidence_type: text('evidence_type', { length: 64 }).notNull(),
    // Names the product, brand, ingredient, or claim evaluated by this evidence.
    evidence_subject: text('evidence_subject', { length: 255 }).notNull(),
    // Stores the source's position, such as supports, disputes, unknown, or neutral.
    evidence_position: text('evidence_position', { length: 64 }).notNull(),
    // Stores an optional stable identifier for the upstream source document or provider record.
    source_id: text('source_id', { length: 128 }),
    // Stores the human-readable source or provider name.
    source_name: text('source_name', { length: 255 }).notNull(),
    // Stores an optional URL where the source evidence can be reviewed.
    source_url: text('source_url', { length: 1024 }),
    // Stores the configured trust score assigned to the source at decision time.
    source_trust_score: integer('source_trust_score'),
    // Stores whether the evidence was fresh, stale, expired, or unknown at decision time.
    evidence_freshness_status: text('evidence_freshness_status', { length: 32 }).notNull(),
    // Records when the application or provider observed this evidence.
    observed_at: text('observed_at'),
    // Records when the underlying source originally published the evidence.
    published_at: text('published_at'),
    // Stores a minimized structured evidence snapshot needed to reproduce the decision.
    evidence_payload: text('evidence_payload', { mode: 'json' }).$type<Record<string, unknown>>(),
    // Records when this evidence reference was committed with the decision.
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    // Supports controlled soft deletion without erasing the physical record immediately.
    deleted_at: text('deleted_at'),
  },
  (table) => [
    index('product_fit_decision_evidence_decision_id_idx').on(table.product_fit_decision_id),
    index('product_fit_decision_evidence_source_id_idx').on(table.source_id),
    index('product_fit_decision_evidence_type_idx').on(table.evidence_type),
    index('product_fit_decision_evidence_deleted_at_idx').on(table.deleted_at),
  ],
)

/** Preserves material conflicts between evidence sources instead of silently averaging their claims. */
export const table_product_fit_decision_disagreement = sqliteTable(
  'product_fit_decision_disagreement',
  {
    product_fit_decision_disagreement_id: integer('product_fit_decision_disagreement_id').primaryKey({ autoIncrement: true }),
    // References the decision affected by the conflict.
    product_fit_decision_id: integer('product_fit_decision_id').notNull(),
    // Classifies the conflict, such as boycott_status, identity, ingredient, or freshness.
    disagreement_type: text('disagreement_type', { length: 64 }).notNull(),
    // Names the entity or claim on which the evidence sources disagree.
    disagreement_subject: text('disagreement_subject', { length: 255 }).notNull(),
    // References the first conflicting decision-evidence record when available.
    first_evidence_id: integer('first_evidence_id'),
    // References the second conflicting decision-evidence record when available.
    second_evidence_id: integer('second_evidence_id'),
    // Preserves the first source's position.
    first_position: text('first_position', { length: 64 }).notNull(),
    // Preserves the second source's position.
    second_position: text('second_position', { length: 64 }).notNull(),
    // Stores whether the conflict is unresolved, policy_resolved, superseded, or requires review.
    resolution_status: text('resolution_status', { length: 32 }).notNull(),
    // Explains the deterministic policy or evidence change used to handle the conflict.
    resolution_reason: text('resolution_reason', { length: 1024 }),
    // Records when the disagreement was persisted.
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    // Supports controlled soft deletion while retaining conflict history when required.
    deleted_at: text('deleted_at'),
  },
  (table) => [
    index('product_fit_decision_disagreement_decision_id_idx').on(table.product_fit_decision_id),
    index('product_fit_decision_disagreement_type_idx').on(table.disagreement_type),
    index('product_fit_decision_disagreement_resolution_status_idx').on(table.resolution_status),
    index('product_fit_decision_disagreement_deleted_at_idx').on(table.deleted_at),
  ],
)

/** Stores append-only, privacy-minimized execution and gate events for product-fit accountability. */
export const table_product_fit_audit_event = sqliteTable(
  'product_fit_audit_event',
  {
    product_fit_audit_event_id: integer('product_fit_audit_event_id').primaryKey({ autoIncrement: true }),
    // References the related decision when the event occurred after a decision ID existed.
    product_fit_decision_id: integer('product_fit_decision_id'),
    // Classifies the event, such as request_started, consent_checked, gate_blocked, or decision_committed.
    audit_event_type: text('audit_event_type', { length: 64 }).notNull(),
    // Stores whether the audited operation succeeded, failed, blocked, or was skipped.
    audit_event_status: text('audit_event_status', { length: 32 }).notNull(),
    // Stores privacy-cleared metadata without raw profile values, prompts, or credentials.
    audit_event_payload: text('audit_event_payload', { mode: 'json' }).$type<Record<string, unknown>>(),
    // Records when the audited action actually occurred.
    occurred_at: text('occurred_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    // Records when the audit event was written to the database.
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    // Exists for schema consistency; audit-writer policy must keep events append-only.
    deleted_at: text('deleted_at'),
  },
  (table) => [
    index('product_fit_audit_event_decision_id_idx').on(table.product_fit_decision_id),
    index('product_fit_audit_event_type_idx').on(table.audit_event_type),
    index('product_fit_audit_event_occurred_at_idx').on(table.occurred_at),
    index('product_fit_audit_event_deleted_at_idx').on(table.deleted_at),
  ],
)
