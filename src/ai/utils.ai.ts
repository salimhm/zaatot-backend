import type { FilePart, ImagePart, ModelMessage, TextPart, UserContent } from '@ai-sdk/provider-utils'

import { z } from 'zod'

const image_extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heif', 'heic'] as const
const audio_extensions = ['mp3', 'ogg', 'wav', 'mp4', 'aac', 'm4a', 'opus'] as const

function resolve_media_type(ext: string): string {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'heif':
      return 'image/heif'
    case 'heic':
      return 'image/heic'
    case 'mp3':
      return 'audio/mpeg'
    case 'ogg':
      return 'audio/ogg'
    case 'wav':
      return 'audio/wav'
    case 'mp4':
      return 'audio/mp4'
    case 'aac':
      return 'audio/aac'
    case 'm4a':
      return 'audio/x-m4a'
    case 'opus':
      return 'audio/ogg'
    default:
      return 'application/octet-stream'
  }
}

export async function ai_create_message(text: string, file_ids?: string[]): Promise<ModelMessage[]> {
  let files_data: { content: Buffer; file_id: string }[] = []
  if (file_ids && file_ids.length > 0) {
    files_data = await ai_fetch_file_data(file_ids)
  }

  const parts: UserContent = [{ type: 'text', text } satisfies TextPart]

  for (const file of files_data) {
    const ext = file.file_id.split('.').pop()?.toLowerCase() ?? ''

    if ((image_extensions as readonly string[]).includes(ext)) {
      parts.push({
        type: 'image',
        image: file.content,
        mediaType: resolve_media_type(ext),
      } satisfies ImagePart)
    } else if ((audio_extensions as readonly string[]).includes(ext)) {
      parts.push({
        type: 'file',
        data: file.content,
        mediaType: resolve_media_type(ext),
      } satisfies FilePart)
    } else if (ext === 'txt') {
      parts.push({
        type: 'text',
        text: `File: ${file.file_id}\nContent:\n${file.content.toString('utf8')}`,
      } satisfies TextPart)
    } else {
      console.warn(`Unsupported file type: ${file.file_id}`)
    }
  }

  const message: ModelMessage = { role: 'user', content: parts }
  return [message]
}

export async function ai_fetch_file_data(file_ids: string[]): Promise<{ content: Buffer; file_id: string }[]> {
  const cloudflare_r2_link = process.env.CLOUDFLARE_R2_LINK || ''

  return Promise.all(
    file_ids.map(async (file_id) => {
      const response = await fetch(`${cloudflare_r2_link}/${file_id}`)
      return {
        content: Buffer.from(await response.arrayBuffer()),
        file_id: file_id,
      }
    }),
  )
}

export const enum_tool_find_query = {
  page: z.number().optional(),
  take: z.number().optional().describe('min 1 and max 12'),
  combination_type: z.enum(['AND', 'OR']).optional(),
}
