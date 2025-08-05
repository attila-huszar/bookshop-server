type MongoModel = typeof import('@/models/mongo')
type SQLiteModel = typeof import('@/models/sqlite')

type DBModel = MongoModel | SQLiteModel

declare module '*.mjml' {
  const content: string
  export default content
}
