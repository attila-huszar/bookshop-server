import { seedUsers } from './seeds'

async function seed() {
  const users = await seedUsers()

  console.info('Database seeded \u2705')
  console.info({ ...users })
}

seed()
