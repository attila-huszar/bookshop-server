type MongoModel = typeof import('@/models/mongo')
type SQLiteModel = typeof import('@/models/sqlite')

type DBModel = MongoModel | SQLiteModel

declare module '*.mjml' {
  const content: string
  export default content
}

/**
 * Utility type to convert SQLite string timestamps to Date for MongoDB.
 * SQLite stores timestamps as ISO strings, while MongoDB uses native Date objects.
 */
type WithDateTimestamps<T> = Omit<T, 'createdAt' | 'updatedAt'> & {
  createdAt: Date
  updatedAt: Date
}
