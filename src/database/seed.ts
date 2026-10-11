import { connectDatabase } from '@/db'
import { seedAuthors, seedBooks, seedNews, seedUsers } from './seeds'

export async function seedDatabase() {
  console.info('🌱 Starting database seed...')

  const authors = await seedAuthors()
  const books = await seedBooks()
  const news = await seedNews()
  const users = await seedUsers()

  console.info('✅ Database seeded successfully!')
  console.info({ ...authors, ...books, ...news, ...users })
}

if (import.meta.main) {
  void (async () => {
    try {
      await connectDatabase()
      await seedDatabase()
      process.exit(0)
    } catch (error) {
      console.error('❌ Database seed failed:', error)
      process.exit(1)
    }
  })()
}
