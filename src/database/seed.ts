import { seedAuthors, seedBooks, seedNews, seedUsers } from './seeds'

async function seed() {
  const authors = await seedAuthors()
  const books = await seedBooks()
  const news = await seedNews()
  const users = await seedUsers()

  console.info('Database seeded \u2705')
  console.info({ ...authors, ...books, ...news, ...users })
}

void seed()
