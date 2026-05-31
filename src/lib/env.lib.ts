const required = [
  'NAME',
  'ENV',
  'PORT',
  'JWT_SECRET_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'TURSO_API_TOKEN',
  'TURSO_ORG_NAME',
  'TURSO_GROUP_NAME',
  'TURSO_GROUP_TOKEN',
  'TURSO_DB_MAIN_URL',
  'TURSO_DB_MAIN_TOKEN',
  'REDIS_DB_MAIN_URL',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_BUCKET_NAME',
  'CLOUDFLARE_R2_LINK',
  'QUERY_TAKE_MAX',
  'DB_MAX_CACHED_TENANTS',
  'USER_MAX_TENANTS',
  'OTP_TTL_MINUTES',
  'RATE_LIMIT_GLOBAL_LIMIT',
  'RATE_LIMIT_GLOBAL_DURATION',
  'RATE_LIMIT_FILE_UPLOAD_LIMIT',
  'RATE_LIMIT_FILE_UPLOAD_DURATION',
  'MAX_IMAGE_SIZE_BYTES',
  'MAX_AUDIO_SIZE_BYTES',
  'MAX_VIDEO_SIZE_BYTES',
] as const

const missing = required.filter((key) => !process.env[key])

if (missing.length > 0) {
  console.error(`[env] Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join('\n')}`)
  process.exit(1)
}
