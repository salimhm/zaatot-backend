import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { db_client } from '@db/client.db'
import { table_file } from '@db/tenant.schema.db'
import { select } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'
import { check_rate_limit } from '@lib/middleware.lib'

import { storage_object_main } from '@storage/client.storage'

import { service_access } from '@module/tenant/access/access.service'
import { dto_file, dto_schema_file } from '@module/tenant/file/file.dto'

export const service_file = {
  async find(query: Static<typeof dto_file.find.query>, payload: lib_dto_payload): Promise<Static<typeof dto_file.find.response>> {
    const { tenant_id, file_id, file_name } = query

    await service_access.check_access({ tenant_id }, payload)

    const db = db_client({ tenant_id, payload })

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
    const { tenant_id, file_name, file_type, file_size } = body
    const { user_id } = payload

    await service_access.check_access({ tenant_id }, payload)

    const limit = Number(process.env.RATE_LIMIT_FILE_UPLOAD_LIMIT) || 20
    const duration = Number(process.env.RATE_LIMIT_FILE_UPLOAD_DURATION) || 60
    await check_rate_limit({ key: `rate:file:upload:${user_id}`, limit, duration })

    const daily_limit = Number(process.env.RATE_LIMIT_FILE_UPLOAD_DAILY_LIMIT) || 120
    const daily_duration = Number(process.env.RATE_LIMIT_FILE_UPLOAD_DAILY_DURATION) || 86400
    await check_rate_limit({ key: `rate:file:upload:daily:${user_id}`, limit: daily_limit, duration: daily_duration })

    const is_image = file_type.startsWith('image/')
    const is_audio = file_type.startsWith('audio/')
    const is_video = file_type.startsWith('video/')
    const max_image_size = Number(process.env.MAX_IMAGE_SIZE_BYTES) || 4 * 1024 * 1024
    const max_audio_size = Number(process.env.MAX_AUDIO_SIZE_BYTES) || 12 * 1024 * 1024
    const max_video_size = Number(process.env.MAX_VIDEO_SIZE_BYTES) || 100 * 1024 * 1024

    if (!is_image && !is_audio && !is_video) throw lib_error.bad_request

    if (is_image && file_size > max_image_size) throw lib_error.file_max_size
    if (is_audio && file_size > max_audio_size) throw lib_error.file_max_size
    if (is_video && file_size > max_video_size) throw lib_error.file_max_size

    const current_time = Date.now().toString()
    const random_bytes = new Uint32Array(1)
    crypto.getRandomValues(random_bytes)
    const random = 1_000_000 + ((random_bytes[0] ?? 0) % 1_000_000)

    const file_extension = file_name ? `.${file_name.split('.').pop()}` : ''
    const folder_name = `user-${user_id}`
    const file_id = `${folder_name}/${current_time}${random}${file_extension}`
    const resolved_file_name = file_name.slice(0, 127)

    try {
      const command = new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: file_id,
        ContentType: file_type,
      })

      const upload_url = await getSignedUrl(storage_object_main, command, {
        expiresIn: Number(process.env.CLOUDFLARE_R2_PRESIGNED_URL_EXPIRES_IN) || 720,
      })

      const db = db_client({ tenant_id, payload })
      const [data] = await db.insert(table_file).values({ file_id, file_name: resolved_file_name, user_id }).returning()

      if (!data) throw lib_error.bad_request
      const { deleted_at, ...response_data } = data
      return { upload_url, data: response_data as Static<typeof dto_schema_file> }
    } catch (error) {
      const err = error as { status?: number }
      if (err?.status) throw error
      throw lib_error.internal_server_error
    }
  },

  async update(body: Static<typeof dto_file.update.body>, payload: lib_dto_payload): Promise<Static<typeof dto_file.update.response>> {
    const { tenant_id, file_id, file_name } = body
    const { user_id } = payload
    await service_access.check_access({ tenant_id }, payload)

    const db = db_client({ tenant_id, payload })
    const [data] = await db
      .update(table_file)
      .set({ file_name })
      .where(and(eq(table_file.file_id, file_id), eq(table_file.user_id, user_id), isNull(table_file.deleted_at)))
      .returning()

    if (!data) throw lib_error.not_found
    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_schema_file> }
  },

  async delete(body: Static<typeof dto_file.delete.body>, payload: lib_dto_payload): Promise<Static<typeof dto_file.delete.response>> {
    const { tenant_id, file_id } = body
    const { user_id } = payload
    await service_access.check_access({ tenant_id }, payload)

    const db = db_client({ tenant_id, payload })

    const [data] = await db
      .update(table_file)
      .set({ deleted_at: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(table_file.file_id, file_id), eq(table_file.user_id, user_id)))
      .returning()

    if (!data) throw lib_error.not_found
    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_schema_file> }
  },
}
