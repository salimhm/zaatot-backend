import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { db_client } from '@db/client.db'
import { table_organization, table_organization_user } from '@db/main.schema.db'
import { select } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'

import { dto_organization } from '@module/main/organization/organization.dto'

export const service_organization = {
  async find(query: Static<typeof dto_organization.find.query>, payload: lib_dto_payload): Promise<Static<typeof dto_organization.find.response>> {
    const { organization_id, organization_name } = query
    const db = db_client()

    return await select({
      db,
      table: table_organization,
      allowed_columns: {
        organization_id: table_organization.organization_id,
        organization_schema_version: table_organization.organization_schema_version,
        organization_name: table_organization.organization_name,
        organization_db_id: table_organization.organization_db_id,
        organization_db_url: table_organization.organization_db_url,
        user_id: table_organization.user_id,
        created_at: table_organization.created_at,
      },
      joins: [{ table_to_join: table_organization_user, column_to_join: 'organization_id' }],
      where: [
        [table_organization.organization_id, organization_id, '[]'],
        [table_organization.organization_name, organization_name, '%'],
        [table_organization_user.user_id, [String(payload.user_id)], '[]'],
      ],
      query,
    })
  },

  async create(
    body: Static<typeof dto_organization.create.body>,
    payload: lib_dto_payload,
  ): Promise<Static<typeof dto_organization.create.response>> {
    const { user_id } = payload
    const db = db_client()

    const [user_orgs] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(table_organization)
      .where(and(eq(table_organization.user_id, user_id), isNull(table_organization.deleted_at)))

    const max_orgs = Number(process.env.USER_MAX_ORGANIZATIONS) || 12
    if (user_orgs && user_orgs.count >= max_orgs) {
      throw lib_error.user_max_organizations
    }

    const [data] = await db.insert(table_organization).values({ organization_name: body.organization_name, user_id }).returning()

    if (!data) {
      throw lib_error.bad_request
    }

    const { organization_id } = data

    await db.insert(table_organization_user).values({
      user_id,
      organization_id,
    })

    try {
      const { service_tenant } = await import('@module/main/tenant/tenant.service')
      await service_tenant.provision_tenant_db({ tenant_id: organization_id, user_id, tenant_type: 'organization' })
    } catch (error) {
      throw lib_error.organization_provision_failed
    }

    const { deleted_at, ...response_data } = data
    return { data: response_data }
  },

  async update(
    body: Static<typeof dto_organization.update.body>,
    payload: lib_dto_payload,
  ): Promise<Static<typeof dto_organization.update.response>> {
    const { organization_id, ...updates } = body
    const db = db_client()

    const [data] = await db
      .update(table_organization)
      .set(updates)
      .where(
        and(
          eq(table_organization.organization_id, organization_id),
          eq(table_organization.user_id, payload.user_id),
          isNull(table_organization.deleted_at),
        ),
      )
      .returning()

    if (!data) throw lib_error.not_found

    const { deleted_at, ...response_data } = data
    return { data: response_data }
  },

  async delete(
    body: Static<typeof dto_organization.delete.body>,
    payload: lib_dto_payload,
  ): Promise<Static<typeof dto_organization.delete.response>> {
    const { organization_id } = body
    const db = db_client()

    const [data] = await db
      .update(table_organization)
      .set({ deleted_at: new Date().toISOString() })
      .where(
        and(
          eq(table_organization.organization_id, organization_id),
          eq(table_organization.user_id, payload.user_id),
          isNull(table_organization.deleted_at),
        ),
      )
      .returning()

    if (!data) throw lib_error.not_found

    const { deleted_at, ...response_data } = data
    return { data: response_data }
  },
}
