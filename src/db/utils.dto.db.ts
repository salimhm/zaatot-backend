import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'

export type AllowedColumns = { [key: string]: AnySQLiteColumn }

export type WhereCondition = '[]' | '%%' | '%' | '<>' | '>' | '>=' | '<' | '<=' | '=' | '!='
export type WhereEntry = [column: AnySQLiteColumn, value: unknown, condition: WhereCondition]

export type CombinationType = 'AND' | 'OR'

export type SelectQueryProps = {
  page?: number
  take?: number
  order_by?: string | string[]
  group_by?: string | string[]
  combination_type?: CombinationType
  columns?: string[]
  count?: 'true' | 'false'
}

export type JoinConfig = {
  table_to_join: SQLiteTable
  column_to_join: string
}

export type SelectParams = {
  db: LibSQLDatabase<Record<string, unknown>>
  table: SQLiteTable
  allowed_columns: AllowedColumns
  where: WhereEntry[]
  query: SelectQueryProps
  joins?: JoinConfig[]
}
