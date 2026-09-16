import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { and, desc, eq } from 'drizzle-orm'
import { db_client } from '@db/client.db'
import { table_product_fit_consent, table_product_fit_profile } from '@db/user.schema.db'

import { lib_error } from '@lib/error.lib'

import { service_access } from '@module/tenant/access/access.service'
import { dto_product_fit_vault } from '@module/user/product-fit-vault/product-fit-vault.dto'
import { product_fit_consent_is_active, product_fit_profile_is_covered } from '@module/user/product-fit-vault/product-fit-vault.util'

export const service_product_fit_vault = {
  async find(
    query: Static<typeof dto_product_fit_vault.find.query>,
    payload: lib_dto_payload,
  ): Promise<Static<typeof dto_product_fit_vault.find.response>> {
    if (!payload.tenants?.some((tenant) => tenant.tenant_id === payload.user_id && tenant.tenant_type === 'user')) throw lib_error.unauthorized
    await service_access.check_access({ tenant_id: payload.user_id }, payload)
    const db = db_client({ tenant_id: payload.user_id, payload })
    const purposes: string[] = []
    if (query.personalization) purposes.push('personalized_product_fit')
    if (query.history) purposes.push('product_fit_history')
    if (!purposes.length) return { version: 'none', profile: null, history_allowed: false }
    const rows = (
      await Promise.all(
        purposes.map((purpose) =>
          db
            .select()
            .from(table_product_fit_consent)
            .where(eq(table_product_fit_consent.consent_purpose, purpose))
            .orderBy(desc(table_product_fit_consent.consent_version))
            .limit(1),
        ),
      )
    ).flat()
    const fit_consent = rows.find((row) => row.consent_purpose === 'personalized_product_fit')
    const history_consent = rows.find((row) => row.consent_purpose === 'product_fit_history')
    const version = [fit_consent, history_consent]
      .map((row) =>
        row ? [row.product_fit_consent_id, row.consent_version, row.consent_hash, product_fit_consent_is_active(row)].join(':') : 'none',
      )
      .join('|')
    const result: Static<typeof dto_product_fit_vault.find.response> = {
      version,
      profile: null,
      history_allowed: query.history && product_fit_consent_is_active(history_consent),
    }
    if (!query.personalization || !product_fit_consent_is_active(fit_consent) || !fit_consent?.product_fit_profile_id || !fit_consent.profile_version)
      return result
    const [profile] = await db
      .select({
        product_fit_profile_id: table_product_fit_profile.product_fit_profile_id,
        profile_version: table_product_fit_profile.profile_version,
        profile_hash: table_product_fit_profile.profile_hash,
        effective_at: table_product_fit_profile.effective_at,
        superseded_at: table_product_fit_profile.superseded_at,
        deleted_at: table_product_fit_profile.deleted_at,
        profile_goals: table_product_fit_profile.profile_goals,
        profile_allergies: table_product_fit_profile.profile_allergies,
        profile_avoided_ingredients: table_product_fit_profile.profile_avoided_ingredients,
        profile_diets: table_product_fit_profile.profile_diets,
        profile_ethics_policy: table_product_fit_profile.profile_ethics_policy,
      })
      .from(table_product_fit_profile)
      .where(
        and(
          eq(table_product_fit_profile.product_fit_profile_id, fit_consent.product_fit_profile_id),
          eq(table_product_fit_profile.profile_version, fit_consent.profile_version),
        ),
      )
      .limit(1)
    if (!profile || !product_fit_profile_is_covered(profile, fit_consent)) return result
    if (profile.profile_ethics_policy && profile.profile_ethics_policy !== 'avoid_boycott') return result
    if (
      profile.profile_goals.length > 20 ||
      profile.profile_allergies.length > 20 ||
      profile.profile_avoided_ingredients.length > 30 ||
      profile.profile_diets.length > 10
    )
      return result
    result.version += ':' + profile.profile_hash
    result.profile = {
      goals: [...profile.profile_goals, ...(profile.profile_ethics_policy === 'avoid_boycott' ? ['avoid_boycott'] : [])],
      allergens: profile.profile_allergies,
      avoided_ingredients: profile.profile_avoided_ingredients,
      diets: profile.profile_diets,
    }
    return result
  },
}
