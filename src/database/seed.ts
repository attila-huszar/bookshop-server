import { seedAuthors, seedBooks, seedNews, seedUsers } from './seeds'

async function seed() {
  console.info('🌱 Starting database seed...')

  const authors = await seedAuthors()
  const books = await seedBooks()
  const news = await seedNews()
  const users = await seedUsers()

  console.info('✅ Database seeded successfully!')
  console.info({ ...authors, ...books, ...news, ...users })
  process.exit(0)
}

void (async () => {
  try {
    await seed()
    process.exit(0)
  } catch (error) {
    console.error('❌ Database seed failed:', error)
    process.exit(1)
  }
})()
