import type { AllowedColumns, SelectParams, WhereEntry } from '@db/utils.dto.db'

import { and, asc, between, desc, eq, gt, gte, inArray, isNull, like, lt, lte, ne, or, sql } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { db_redis_main } from '@db/client.db'

import { lib_error } from '@lib/error.lib'

export const check_allowed_columns = (columns: string[] | undefined, allowed_columns: AllowedColumns) => {
  if (!columns) return allowed_columns

  const filtered_columns = columns.filter((item) => item.trim() !== '')

  if (filtered_columns.length < 1) return allowed_columns

  const $columns: AllowedColumns = {}

  for (const column_name of filtered_columns) {
    const trimmed = column_name.trim()

    if (!(trimmed in allowed_columns)) {
      throw lib_error.invalid_column
    }

    $columns[trimmed] = allowed_columns[trimmed]!
  }

  return $columns
}

export const where_build = (entries: WhereEntry[]) => {
  const where: any[] = []

  entries.forEach(([column, column_value, condition]) => {
    const is_number = typeof column_value === 'number'
    const is_array = Array.isArray(column_value)

    if (!is_number && !is_array && column_value == null) return

    const filtered_value = is_array
      ? column_value.filter((item: any) => (typeof item === 'string' ? item.trim() !== '' : item != null))
      : column_value

    const has_value = is_number ? true : is_array ? filtered_value.length > 0 : filtered_value != null

    if (!has_value) return

    if (condition === '[]') {
      if (is_array) where.push(inArray(column, filtered_value))
      else console.warn(`[WHERE] Operator "[]" expects an array, got scalar for column "${(column as any).name}"`)
    } else if (condition === '%%') {
      if (is_array && filtered_value.length > 0) {
        const $cond = or(...filtered_value.map((v: string) => like(column, `%${v}%`)))
        if ($cond) where.push($cond)
      } else if (!is_array) {
        console.warn(`[WHERE] Operator "%%" expects an array, got scalar for column "${(column as any).name}"`)
      }
    } else if (condition === '%') {
      if (is_array && filtered_value.length > 0) {
        const $cond = or(...filtered_value.map((v: string) => like(column, `${v}%`)))
        if ($cond) where.push($cond)
      } else if (!is_array) {
        console.warn(`[WHERE] Operator "%" expects an array, got scalar for column "${(column as any).name}"`)
      }
    } else if (condition === '<>') {
      if (is_array && filtered_value.length === 2) {
        where.push(between(column, filtered_value[0], filtered_value[1]))
      } else {
        console.warn(
          `[WHERE] Operator "<>" expects array of length 2, got ${is_array ? filtered_value.length : 'scalar'} for column "${(column as any).name}"`,
        )
      }
    } else if (condition === '>') {
      where.push(gt(column, is_number ? filtered_value : is_array ? filtered_value[0] : filtered_value))
    } else if (condition === '>=') {
      where.push(gte(column, is_number ? filtered_value : is_array ? filtered_value[0] : filtered_value))
    } else if (condition === '<') {
      where.push(lt(column, is_number ? filtered_value : is_array ? filtered_value[0] : filtered_value))
    } else if (condition === '<=') {
      where.push(lte(column, is_number ? filtered_value : is_array ? filtered_value[0] : filtered_value))
    } else if (condition === '=') {
      if (!is_array) where.push(eq(column, filtered_value))
      else console.warn(`[WHERE] Operator "=" expects a scalar, got array for column "${(column as any).name}"`)
    } else if (condition === '!=') {
      if (!is_array) where.push(ne(column, filtered_value))
      else console.warn(`[WHERE] Operator "!=" expects a scalar, got array for column "${(column as any).name}"`)
    }
  })

  return where
}

export const order_by_build = (order_by: string | string[] | undefined, allowed_columns: AllowedColumns) => {
  if (!order_by) return []

  const entries = Array.isArray(order_by) ? order_by : [order_by]

  return entries
    .filter((entry) => entry.trim() !== '')
    .map((entry) => {
      const is_desc = entry.startsWith('-')
      const column_name = is_desc ? entry.slice(1) : entry

      if (!(column_name in allowed_columns)) {
        throw lib_error.invalid_column
      }

      return is_desc ? desc(allowed_columns[column_name]!) : asc(allowed_columns[column_name]!)
    })
}

export const group_by_build = (group_by: string | string[] | undefined, allowed_columns: AllowedColumns) => {
  if (!group_by) return []

  const entries = Array.isArray(group_by) ? group_by : [group_by]

  return entries
    .filter((entry) => entry.trim() !== '')
    .map((entry) => {
      if (!(entry in allowed_columns)) {
        throw lib_error.invalid_column
      }

      return allowed_columns[entry]!
    })
}

export const select = async ({ db, table, allowed_columns, where, query, joins }: SelectParams) => {
  const { page = 1, take = 3, order_by, group_by, combination_type = 'AND', columns, count = 'false' } = query

  const resolved_columns: AllowedColumns = {
    ...allowed_columns,
    created_at: table.created_at,
  }

  const selected_columns: any = check_allowed_columns(columns, resolved_columns)

  const where_conditions = where_build(where)

  const order_by_conditions = order_by_build(order_by, resolved_columns)

  const group_by_conditions = group_by_build(group_by, resolved_columns)

  let query_builder = db
    .select(selected_columns)
    .from(table)
    .where(
      combination_type === 'OR' ? and(or(...where_conditions), isNull(table.deleted_at)) : and(and(...where_conditions), isNull(table.deleted_at)),
    )
    .limit(take)

  if (joins && Array.isArray(joins)) {
    for (const join of joins) {
      if (join.table_to_join && join.column_to_join) {
        query_builder = query_builder.leftJoin(join.table_to_join, eq(table[join.column_to_join], join.table_to_join[join.column_to_join]))
      }
    }
  }

  const data = await query_builder
    .offset((page - 1) * take)
    .orderBy(...order_by_conditions)
    .groupBy(...group_by_conditions)

  if (data.length > 0) {
    if (count === 'true') {
      const db_count_query = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(
          combination_type === 'OR'
            ? and(or(...where_conditions), isNull(table.deleted_at))
            : and(and(...where_conditions), isNull(table.deleted_at)),
        )

      const rows = db_count_query[0]?.count || 0
      const pages = Math.ceil(rows / take)

      return { rows, pages, page, take, data }
    }

    return { rows: null, pages: null, page, take, data }
  }

  const table_name = getTableConfig(table).name

  if (table_name === 'user') throw lib_error.not_found_user
  if (table_name === 'tenant') throw lib_error.not_found_tenant
  if (table_name === 'contact') throw lib_error.not_found_contact
  if (table_name === 'access') throw lib_error.not_found_access
  if (table_name === 'file') throw lib_error.not_found_file

  throw lib_error.not_found
}

export const get_schema_info = async (db: any) => {
  const tables = (await db.run(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%sqlite%' AND name NOT LIKE '%drizzle%'`,
  )) as any

  const schema_info: Record<string, any> = {}

  for (const table of tables.rows) {
    const table_name = String(table.name)

    const columns = (await db.run(sql`PRAGMA table_info(${sql.raw(table_name)})`)) as any

    schema_info[table_name] = {
      columns: columns.rows,
    }
  }

  return schema_info
}

export const normalize_default = (val: any) => {
  if (val == null) return null
  const s = String(val)
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1)
  return s
}

export const sync_add_table = async (db: any, table_name: string, target_table_obj: any) => {
  const table_config = getTableConfig(target_table_obj as any)
  const columns = table_config.columns
  const col_defs = columns
    .map((col: any) => {
      let def = `${col.name} ${col.getSQLType()}`
      if (col.primary) {
        def += ' PRIMARY KEY'
        if (col.autoIncrement) def += ' AUTOINCREMENT'
      }
      if (col.notNull) def += ' NOT NULL'
      if (col.default !== undefined) {
        if (typeof col.default === 'string') def += ` DEFAULT '${col.default}'`
        else if (typeof col.default === 'object') def += ` DEFAULT CURRENT_TIMESTAMP`
        else def += ` DEFAULT ${col.default}`
      } else if (col.hasDefault && col.defaultFn) {
        def += ` DEFAULT CURRENT_TIMESTAMP`
      }
      return def
    })
    .join(', ')

  const query = `CREATE TABLE ${table_name} (${col_defs})`
  try {
    console.log(`[SYNC] ADD TABLE >>`, query)
    await db.run(sql.raw(query))

    if (table_config.indexes && table_config.indexes.length > 0) {
      for (const idx of table_config.indexes) {
        const col_names = idx.config.columns.map((c: any) => c.name).join(', ')
        const unique = idx.config.unique ? 'UNIQUE ' : ''
        const idx_query = `CREATE ${unique}INDEX IF NOT EXISTS ${idx.config.name} ON ${table_name} (${col_names})`
        console.log(`[SYNC] ADD INDEX >>`, idx_query)
        await db.run(sql.raw(idx_query))
      }
    }
  } catch (error) {
    console.error(`[SYNC] FAILED ADD TABLE >>`, error)
  }
}

export const sync_remove_table = async (db: any, table_name: string) => {
  const query = `DROP TABLE IF EXISTS ${table_name}`
  try {
    console.log(`[SYNC] REMOVE TABLE >>`, query)
    await db.run(sql.raw(query))
  } catch (error) {
    console.error(`[SYNC] FAILED REMOVE TABLE >>`, error)
  }
}

export const sync_add_column = async (db: any, table_name: string, target_col: any, indexes: any[] = []) => {
  let def = `${target_col.name} ${target_col.getSQLType()}`
  if (target_col.notNull) def += ' NOT NULL'
  if (target_col.default !== undefined) {
    if (typeof target_col.default === 'string') def += ` DEFAULT '${target_col.default}'`
    else if (typeof target_col.default === 'object') def += ` DEFAULT CURRENT_TIMESTAMP`
    else def += ` DEFAULT ${target_col.default}`
  } else if (target_col.hasDefault && target_col.defaultFn) {
    def += ` DEFAULT CURRENT_TIMESTAMP`
  }

  const query = `ALTER TABLE ${table_name} ADD COLUMN ${def}`
  try {
    console.log(`[SYNC] ADD COLUMN >>`, query)
    await db.run(sql.raw(query))

    for (const idx of indexes) {
      const is_dependent = idx.config.columns.some((c: any) => c.name === target_col.name)
      if (is_dependent) {
        const col_names = idx.config.columns.map((c: any) => c.name).join(', ')
        const unique = idx.config.unique ? 'UNIQUE ' : ''
        const idx_query = `CREATE ${unique}INDEX IF NOT EXISTS ${idx.config.name} ON ${table_name} (${col_names})`
        console.log(`[SYNC] ADD INDEX (NEW COLUMN) >>`, idx_query)
        await db.run(sql.raw(idx_query))
      }
    }
  } catch (error) {
    console.error(`[SYNC] FAILED ADD COLUMN >>`, error)
  }
}

export const sync_remove_column = async (db: any, table_name: string, column_name: string) => {
  const indexes = (await db.run(sql`PRAGMA index_list(${sql.raw(table_name)})`)) as any
  for (const index of indexes.rows) {
    const index_info = (await db.run(sql`PRAGMA index_info(${sql.raw(String(index.name))})`)) as any
    const is_dependent = index_info.rows.some((col: any) => col.name === column_name)
    if (is_dependent) {
      await sync_remove_index(db, String(index.name))
    }
  }

  const query = `ALTER TABLE ${table_name} DROP COLUMN ${column_name}`
  try {
    console.log(`[SYNC] REMOVE COLUMN >>`, query)
    await db.run(sql.raw(query))
  } catch (error) {
    console.error(`[SYNC] FAILED REMOVE COLUMN >>`, error)
  }
}

export const sync_remove_index = async (db: any, index_name: string) => {
  const query = `DROP INDEX IF EXISTS ${index_name}`
  try {
    console.log(`[SYNC] REMOVE INDEX >>`, query)
    await db.run(sql.raw(query))
  } catch (error) {
    console.error(`[SYNC] FAILED REMOVE INDEX >>`, error)
  }
}

export const sync_schema = async (db: any, target_schema: any) => {
  const schema_info = await get_schema_info(db)

  for (const [table_name, details] of Object.entries(schema_info)) {
    const current_columns = (details as any).columns.map((col: any) => ({
      name: col.name,
      type: col.type,
      notnull: col.notnull,
      dflt_value: col.dflt_value,
      pk: col.pk,
    }))

    const target_table_obj = Object.values(target_schema).find((t: any) => getTableConfig(t as any).name === table_name)

    if (target_table_obj) {
      const target_columns: string[] = getTableConfig(target_table_obj as any)
        .columns.map((col: any) => col.name)
        .filter((name: string) => name !== 'created_at' && name !== 'deleted_at')
      const current_col_names: string[] = current_columns
        .map((col: any) => col.name)
        .filter((name: string) => name !== 'created_at' && name !== 'deleted_at')

      const columns_to_add = target_columns.filter((name) => !current_col_names.includes(name))
      const columns_to_remove = current_col_names.filter((name) => !target_columns.includes(name))

      for (const col_name of columns_to_add) {
        const table_config = getTableConfig(target_table_obj as any)
        const target_col = table_config.columns.find((c: any) => c.name === col_name)
        await sync_add_column(db, table_name, target_col, table_config.indexes)
      }
      for (const col_name of columns_to_remove) {
        await sync_remove_column(db, table_name, col_name)
      }
    }
  }

  const target_tables = Object.values(target_schema).map((table: any) => getTableConfig(table as any).name)
  const current_tables = Object.keys(schema_info)

  const tables_to_add = target_tables.filter((name) => !current_tables.includes(name))
  const tables_to_remove = current_tables.filter((name) => !target_tables.includes(name))

  for (const table_name of tables_to_add) {
    const target_table_obj = Object.values(target_schema).find((t: any) => getTableConfig(t as any).name === table_name)
    await sync_add_table(db, table_name, target_table_obj)
  }
  for (const table_name of tables_to_remove) {
    await sync_remove_table(db, table_name)
  }
}

export const check_rate_limit = async (options: { key: string; limit: number; duration: number }): Promise<void> => {
  const { key, limit, duration } = options
  const current = await db_redis_main.incr(key)
  if (current === 1) {
    await db_redis_main.expire(key, duration)
  }
  if (current > limit) {
    throw lib_error.too_many_requests
  }
}

export const get_ip = (request: Request, server?: any) => {
  return server?.requestIP(request)?.address || '127.0.0.1'
}
