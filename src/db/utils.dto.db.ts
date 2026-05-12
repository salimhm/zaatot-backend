import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

export type AllowedColumns = { [key: string]: AnySQLiteColumn }

export type WhereCondition = '[]' | '%%' | '%' | '<>' | '>' | '>=' | '<' | '<=' | '=' | '!='
export type WhereEntry = [column: AnySQLiteColumn, value: any, condition: WhereCondition]

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
  table_to_join: any
  column_to_join: string
}

export type SelectParams = {
  db: any
  table: any
  allowed_columns: AllowedColumns
  where: WhereEntry[]
  query: SelectQueryProps
  joins?: JoinConfig[]
}
