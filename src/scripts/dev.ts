import { $ } from 'bun'
import concurrently from 'concurrently'

process.env.NODE_ENV = 'development'
process.env.BUN_RUN_MODE = '--watch'
process.env.NGROK_AUTHTOKEN = ''

try {
  const { result: startup } = concurrently([
    {
      name: 'docker',
      command: 'docker compose up --build --detach --wait --wait-timeout 120',
    },
  ])

  const [docker] = await startup.catch(async (error: unknown) => {
    await $`docker compose logs --tail 50`.nothrow()
    throw error
  })

  if (docker && !docker.killed) {
    await concurrently(
      [
        {
          name: 'client',
          command: 'bun run --cwd ../bookshop-client dev:client',
        },
        {
          name: 'docker',
          command:
            'docker compose up --no-build --no-recreate --abort-on-container-exit',
        },
      ],
      { killOthersOn: ['failure', 'success'] },
    ).result
  }
} catch {
  process.exitCode = 1
} finally {
  const stopped = await $`docker compose stop`.nothrow()
  if (stopped.exitCode !== 0) {
    process.exitCode = 1
  }
}
