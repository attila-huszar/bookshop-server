import { seedBooks, seedUsers } from './seeds'

async function seed() {
  const books = await seedBooks()
  const users = await seedUsers()

  console.info('Database seeded \u2705')
  console.info({ ...books, ...users })
}

seed()
