import { seedAuthors, seedBooks, seedUsers } from './seeds'

async function seed() {
  const authors = await seedAuthors()
  const books = await seedBooks()
  const users = await seedUsers()

  console.info('Database seeded \u2705')
  console.info({ ...authors, ...books, ...users })
}

seed()
