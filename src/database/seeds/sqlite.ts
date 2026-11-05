import type {
  SQLiteColumn,
  SQLiteInsertValue,
  SQLiteTable,
} from 'drizzle-orm/sqlite-core'

export async function seedSqlite<T extends SQLiteTable & { id: SQLiteColumn }>(
  table: T,
  values: SQLiteInsertValue<T>[],
) {
  const { sqlite } = await import('@/database/sqlite')
  const inserted = await sqlite
    .insert(table)
    .values(values)
    .onConflictDoNothing({ target: table.id })
    .returning({ id: table.id })

  return {
    inserted: inserted.length,
    existing: values.length - inserted.length,
  }
}
