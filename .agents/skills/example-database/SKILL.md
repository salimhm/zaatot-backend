---
name: example-database
description: Required code pattern for all database client or tables schema generated outputs.
---

1. **Client file (client.db.ts)**: Strictly follow this pattern!
```typescript
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

export function get_tenant_url(organization_id: number): string {
  const db_name = `db-${process.env.NAME}-${process.env.ENV}-organization-${organization_id}`
  return `libsql://${db_name}-${process.env.TURSO_ORG_NAME}.turso.io`
}

export async function db_client(options: { url?: string, token?: string, organization_id?: number } = {}) {
  const { url, token, organization_id } = options;

  const resolved_url = organization_id 
    ? get_tenant_url(organization_id)
    : (url || process.env.TURSO_DB_MAIN_URL!)

  const resolved_token = organization_id
    ? (token || process.env.TURSO_GROUP_TOKEN!)
    : (token || process.env.TURSO_DB_MAIN_TOKEN!)

  return drizzle(
    createClient({
      url: resolved_url,
      authToken: resolved_token,
    }),
  )
}
```

2. **Drizzle Config (drizzle.config.ts)**: Strictly follow this pattern!
```typescript
/// <reference types="bun-types" />
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/main.db.schema.ts',
    out: './drizzle',
    dialect: 'turso',
    dbCredentials: {
      url: process.env.TURSO_DB_MAIN_URL!,
        authToken: process.env.TURSO_DB_MAIN_TOKEN!,
    },
})
```

3. **Main Database Schema (main.db.schema.ts)**: Strictly follow this pattern!
```typescript
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { enum_otp_action } from '@lib/enum.lib'

export const table_user = sqliteTable(
  "user",
  {
    user_id: integer("user_id").primaryKey({ autoIncrement: true }),
    user_phone: text("user_phone", { length: 18 }).notNull(),
    user_first_name: text("user_first_name", { length: 32 }).notNull(),
    user_last_name: text("user_last_name", { length: 32 }).notNull(),
    user_image: text("user_image", { length: 32 }),
    created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text("deleted_at"),
  },
  (table) => [
    index("user_phone_idx").on(table.user_phone),
    index("user_first_name_idx").on(table.user_first_name),
    index("user_last_name_idx").on(table.user_last_name),
    index("user_deleted_at_idx").on(table.deleted_at),
  ]
)

export const table_file = sqliteTable(
  "file",
  {
    file_id: text("file_id", { length: 64 }).primaryKey(),
    file_name: text("file_name", { length: 127 }),
    user_id: integer("user_id").notNull(),
    created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text("deleted_at"),
  },
  (table) => [
    index("file_name_idx").on(table.file_name),
    index("file_deleted_at_idx").on(table.deleted_at),
  ]
)

export const table_<table_name> = sqliteTable(
  '<table_name>', 
  {
    <table_name>_<column_name>: <type>('<table_name>_<column_name>').<props>,
    //other columns...
    created_at: text('created_at').notNull().default(new Date().toISOString()),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    index('<table_name>_<column_name>_idx').on(table.<table_name>_<column_name>),
    //other indexes...
  ]
)
```
