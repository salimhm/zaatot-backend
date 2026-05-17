import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { and, eq, isNull, ne } from 'drizzle-orm'
import { db_client } from '@db/client.db'
import { table_user } from '@db/main.schema.db'
import { select } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'

import { dto_user } from '@module/main/user/user.dto'

const check_unique = async (
  db: any,
  opts: {
    user_phone?: string
    exclude_user_id?: number
  },
) => {
  if (opts.user_phone) {
    const conditions = [eq(table_user.user_phone, opts.user_phone), isNull(table_user.deleted_at)]
    if (opts.exclude_user_id) conditions.push(ne(table_user.user_id, opts.exclude_user_id))

    const [existing] = await db
      .select({ user_id: table_user.user_id })
      .from(table_user)
      .where(and(...conditions))
      .limit(1)

    if (existing) throw lib_error.phone_already_exist
  }
}

export const service_user = {
  async find(query: Static<typeof dto_user.find.query>): Promise<Static<typeof dto_user.find.response>> {
    const { user_id, user_phone, user_first_name, user_last_name } = query
    const db = await db_client()
    return await select({
      db,
      table: table_user,
      allowed_columns: {
        user_id: table_user.user_id,
        user_phone: table_user.user_phone,
        user_first_name: table_user.user_first_name,
        user_last_name: table_user.user_last_name,
        user_image: table_user.user_image,
      },
      where: [
        [table_user.user_id, user_id, '[]'],
        [table_user.user_phone, user_phone, '[]'],
        [table_user.user_first_name, user_first_name, '%'],
        [table_user.user_last_name, user_last_name, '%'],
      ],
      query,
    })
  },

  async create(body: Static<typeof dto_user.create.body>): Promise<Static<typeof dto_user.create.response>> {
    const db = await db_client()

    await check_unique(db, {
      user_phone: body.user_phone,
    })

    const [data] = await db.insert(table_user).values(body).returning()
    return { data }
  },

  async update(body: Static<typeof dto_user.update.body>, payload: lib_dto_payload): Promise<Static<typeof dto_user.update.response>> {
    const { user_id } = payload
    const db = await db_client()

    await check_unique(db, {
      user_phone: body.user_phone,
      exclude_user_id: user_id,
    })

    const [data] = await db.update(table_user).set(body).where(eq(table_user.user_id, user_id)).returning()
    return { data }
  },
}
