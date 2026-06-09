import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { and, eq, isNull } from 'drizzle-orm'
import { db_client } from '@db/client.db'
import { table_contact } from '@db/organization.schema.db'
import { select } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'

import { dto_contact, dto_schema_contact } from '@module/organization/contact/contact.dto'
import { service_access } from '@module/tenant/access/access.service'

export const service_contact = {
  async find(query: Static<typeof dto_contact.find.query>, payload: lib_dto_payload): Promise<Static<typeof dto_contact.find.response>> {
    const { tenant_id, contact_id, contact_name, contact_phone, contact_status } = query

    await service_access.check_access({ tenant_id }, payload)

    const db = db_client({ tenant_id, payload })

    return await select({
      db,
      table: table_contact,
      allowed_columns: {
        contact_id: table_contact.contact_id,
        contact_name: table_contact.contact_name,
        contact_gender: table_contact.contact_gender,
        contact_birthday: table_contact.contact_birthday,
        contact_national_id: table_contact.contact_national_id,
        contact_passport_id: table_contact.contact_passport_id,
        contact_address: table_contact.contact_address,
        contact_city: table_contact.contact_city,
        contact_country: table_contact.contact_country,
        contact_nationality: table_contact.contact_nationality,
        contact_metadata: table_contact.contact_metadata,
        contact_phone: table_contact.contact_phone,
        contact_status: table_contact.contact_status,
        created_at: table_contact.created_at,
      },
      where: [
        [table_contact.contact_id, contact_id, '[]'],
        [table_contact.contact_phone, contact_phone, '[]'],
        [table_contact.contact_name, contact_name, '%'],
        [table_contact.contact_status, contact_status, '[]'],
      ],
      query,
    })
  },

  async create(body: Static<typeof dto_contact.create.body>, payload: lib_dto_payload): Promise<Static<typeof dto_contact.create.response>> {
    const { tenant_id, ...contact_data } = body

    await service_access.check_access({ tenant_id }, payload)

    try {
      await this.find({ columns: ['contact_phone'], tenant_id, contact_phone: [body.contact_phone] }, payload)
      throw lib_error.phone_already_exist
    } catch (error: unknown) {
      const err = error as { code?: string }
      if (err?.code !== 'not-found-contact') throw error
    }

    const db = db_client({ tenant_id, payload })

    const [data] = await db.insert(table_contact).values(contact_data).returning()

    if (!data) throw lib_error.bad_request
    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_schema_contact> }
  },

  async update(body: Static<typeof dto_contact.update.body>, payload: lib_dto_payload): Promise<Static<typeof dto_contact.update.response>> {
    const { tenant_id, contact_id, ...contact_data } = body

    await service_access.check_access({ tenant_id }, payload)
    await this.find({ columns: ['contact_id'], tenant_id, contact_id: [contact_id] }, payload)

    const db = db_client({ tenant_id, payload })

    const [data] = await db
      .update(table_contact)
      .set(contact_data)
      .where(and(eq(table_contact.contact_id, contact_id), isNull(table_contact.deleted_at)))
      .returning()

    if (!data) throw lib_error.not_found
    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_schema_contact> }
  },

  async delete(body: Static<typeof dto_contact.delete.body>, payload: lib_dto_payload): Promise<Static<typeof dto_contact.delete.response>> {
    const { tenant_id, contact_id } = body

    await service_access.check_access({ tenant_id }, payload)
    await this.find({ columns: ['contact_id'], tenant_id, contact_id: [contact_id] }, payload)

    const db = db_client({ tenant_id, payload })

    const [data] = await db
      .update(table_contact)
      .set({ deleted_at: new Date().toISOString() })
      .where(and(eq(table_contact.contact_id, contact_id), isNull(table_contact.deleted_at)))
      .returning()

    if (!data) throw lib_error.not_found
    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_schema_contact> }
  },
}
