import { validateEnv } from '@/config/validateEnv'
import { runProcess } from '@/utils/process.utils'
import { processTiming } from '@/constants/process'
import { DB_REPO } from '@/types/enums'

if (import.meta.main) {
  await runProcess({
    name: 'Setup',
    shutdownMs: processTiming.apiShutdownMs,
    once: true,
    start: async (context) => {
      const config = validateEnv('setup')
      const command =
        config.dbRepo === DB_REPO.SQLITE
          ? [
              'docker',
              'compose',
              'run',
              '--build',
              '--rm',
              '--no-deps',
              '--env',
              'ADMIN_EMAIL',
              '--env',
              'ADMIN_PASSWORD',
              '--env',
              'DB_SQLITE_FILE',
              'server',
              '/bin/sh',
              'docker/database-access.sh',
              'job',
              'bun',
              'src/database/setup.ts',
            ]
          : [process.execPath, 'src/database/setup.ts']

      const child = Bun.spawn(command, {
        env: { ...process.env, DB_SQLITE_FILE: config.dbSqliteFile },
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
      })
      context.defer('setup process', async () => {
        if (child.exitCode === null) {
          child.kill('SIGTERM')
          await child.exited
        }
      })

      const code = await context.wait(child.exited)

      if (code !== 0) {
        throw new Error(
          `${config.dbRepo} setup process exited with code ${code}`,
        )
      }
    },
  })
}
