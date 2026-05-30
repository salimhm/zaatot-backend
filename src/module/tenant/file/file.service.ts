import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { PutObjectCommand } from '@aws-sdk/client-s3'

import { and, eq, sql } from 'drizzle-orm'
import { db_client } from '@db/client.db'
import { table_file } from '@db/tenant.schema.db'
import { select } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'

import { storage_object_main } from '@storage/client.storage'

import { service_access } from '@module/tenant/access/access.service'
import { dto_file, dto_schema_file } from '@module/tenant/file/file.dto'

export const service_file = {
  async find(query: Static<typeof dto_file.find.query>, payload: lib_dto_payload): Promise<Static<typeof dto_file.find.response>> {
    const { tenant_id, file_id, file_name } = query

    await service_access.check_access(tenant_id, payload)

    const db = await db_client({ tenant_id })

    return await select({
      db,
      table: table_file,
      allowed_columns: {
        file_id: table_file.file_id,
        file_name: table_file.file_name,
      },
      where: [
        [table_file.file_id, file_id, '[]'],
        [table_file.file_name, file_name, '%'],
      ],
      query,
    })
  },

  async create(body: Static<typeof dto_file.create.body>, payload: lib_dto_payload): Promise<Static<typeof dto_file.create.response>> {
    const { tenant_id, file, file_name } = body
    const { user_id } = payload

    await service_access.check_access(tenant_id, payload)

    const is_image = file.type.startsWith('image/')
    const is_audio = file.type.startsWith('audio/')
    const is_video = file.type.startsWith('video/')
    const max_image_size = 4 * 1024 * 1024
    const max_audio_size = 12 * 1024 * 1024
    const max_video_size = 100 * 1024 * 1024

    if (is_image && file.size > max_image_size) throw lib_error.file_max_size
    if (is_audio && file.size > max_audio_size) throw lib_error.file_max_size
    if (is_video && file.size > max_video_size) throw lib_error.file_max_size

    const current_time = Date.now().toString()
    const random = Math.floor(Math.random() * (2_000_000 - 1_000_000 + 1)) + 1_000_000

    const file_extension = file.name ? `.${file.name.split('.').pop()}` : ''
    const folder_name = `user-${user_id}`
    const file_id = `${folder_name}/${current_time}${random}${file_extension}`
    console.log('create file', user_id, folder_name)
    const resolved_file_name = (file_name ? file_name : file.name).slice(0, 127)

    try {
      const file_buffer = await file.arrayBuffer()

      const command = new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: file_id,
        Body: Buffer.from(file_buffer),
        ContentType: file.type,
      })

      await storage_object_main.send(command)

      const db = await db_client({ tenant_id })
      const [data] = await db.insert(table_file).values({ file_id, file_name: resolved_file_name, user_id }).returning()

      if (!data) throw lib_error.bad_request
      return { data: data! as unknown as Static<typeof dto_schema_file> }
    } catch (error) {
      throw lib_error.internal_server_error
    }
  },

  async update(body: Static<typeof dto_file.update.body>, payload: lib_dto_payload): Promise<Static<typeof dto_file.update.response>> {
    const { tenant_id, file_id, file_name } = body
    const { user_id } = payload
    await service_access.check_access(tenant_id, payload)

    const db = await db_client({ tenant_id })
    const [data] = await db
      .update(table_file)
      .set({ file_name })
      .where(and(eq(table_file.file_id, file_id), eq(table_file.user_id, user_id)))
      .returning()

    if (!data) throw lib_error.not_found
    return { data: data! as unknown as Static<typeof dto_schema_file> }
  },

  async delete(body: Static<typeof dto_file.delete.body>, payload: lib_dto_payload): Promise<Static<typeof dto_file.delete.response>> {
    const { tenant_id, file_id } = body
    const { user_id } = payload
    await service_access.check_access(tenant_id, payload)

    const db = await db_client({ tenant_id })

    const [data] = await db
      .update(table_file)
      .set({ deleted_at: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(table_file.file_id, file_id), eq(table_file.user_id, user_id)))
      .returning()

    if (!data) throw lib_error.not_found
    return { data: data! as unknown as Static<typeof dto_schema_file> }
  },
}
