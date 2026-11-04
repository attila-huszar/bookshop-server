import { describe, expect, it } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withDatabaseWritesPaused } from '@/scripts/shared/databasePause'

const accessScript = Bun.fileURLToPath(
  new URL('../../docker/database-access.sh', import.meta.url),
)
const lifecycle = new URL('../utils/process.utils.ts', import.meta.url).href
const supported =
  process.platform === 'linux' && Bun.which('flock') && Bun.which('setsid')
const shells = ['/bin/sh']
const dash = Bun.which('dash')

if (dash && !shells.includes(dash)) {
  shells.push(dash)
}

async function waitUntil(ready: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await ready()) {
      return
    }

    await Bun.sleep(20)
  }

  throw new Error('Timed out waiting for the database coordination fixture')
}

async function fixture(
  input: { watch?: boolean; failDrain?: boolean; shell?: string } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'bookshop-writer-pause-'))
  const eventsFile = join(directory, 'events.txt')
  const source = join(directory, 'writer.ts')
  const childPidFile = join(directory, 'writer.pid')
  await Bun.write(eventsFile, '')
  await Bun.write(
    source,
    [
      "import { appendFile } from 'node:fs/promises'",
      'import { runProcess } from ' + JSON.stringify(lifecycle),
      "await runProcess({ name: 'Writer fixture', shutdownMs: 1000,",
      '  start: async context => {',
      '    await Bun.write(' +
        JSON.stringify(childPidFile) +
        ', String(process.pid))',
      '    const timer = setInterval(() => {}, 1000)',
      "    context.defer('writer', async () => {",
      '      clearInterval(timer)',
      '      await Bun.sleep(100)',
      '      await appendFile(' +
        JSON.stringify(eventsFile) +
        ", 'DRAINED\\n')",
      input.failDrain ? "      throw new Error('Fixture drain failed')" : '',
      '    })',
      '    await appendFile(' + JSON.stringify(eventsFile) + ", 'STARTED\\n')",
      '  },',
      '})',
    ].join('\n'),
  )
  const writer = Bun.spawn(
    [
      input.shell ?? '/bin/sh',
      accessScript,
      'service',
      process.execPath,
      '--no-env-file',
      ...(input.watch ? ['--watch'] : []),
      source,
    ],
    {
      env: {
        ...process.env,
        DB_REPO: 'MONGO',
        BOOKSHOP_DATABASE_COORDINATION_DIR: directory,
        BOOKSHOP_CRON_JOB_DIRECTORY: '',
      },
      stdout: 'ignore',
      stderr: 'ignore',
    },
  )
  const events = async () =>
    (await Bun.file(eventsFile).text()).trim().split('\n')

  return {
    directory,
    writer,
    childPidFile,
    events,
    waitStarted: (count: number) =>
      waitUntil(async () => {
        const lines = await events()

        return lines.filter((line) => line === 'STARTED').length === count
      }),
    close: async () => {
      writer.kill('SIGTERM')
      const deadline = setTimeout(() => writer.kill('SIGKILL'), 3000)

      try {
        await writer.exited
      } finally {
        clearTimeout(deadline)
        await rm(directory, { recursive: true, force: true })
      }
    },
  }
}

it('requires a directory for coordinated logical backups', async () => {
  await rejects(
    withDatabaseWritesPaused({
      directory: '',
      run: () => Promise.resolve(),
    }),
    /BOOKSHOP_DATABASE_COORDINATION_DIR/,
  )
})

describe.skipIf(!supported)('logical Mongo backup coordination', () => {
  it('holds new maintenance jobs outside the database until the dump completes', async () => {
    const context = await fixture()
    const marker = join(context.directory, 'job-started')
    let job: ReturnType<typeof Bun.spawn> | undefined

    try {
      await context.waitStarted(1)
      await withDatabaseWritesPaused({
        directory: context.directory,
        run: async () => {
          job = Bun.spawn(
            [
              '/bin/sh',
              accessScript,
              'job',
              process.execPath,
              '--no-env-file',
              '-e',
              'await Bun.write(' + JSON.stringify(marker) + ', "started")',
            ],
            {
              env: {
                ...process.env,
                DB_REPO: 'MONGO',
                BOOKSHOP_DATABASE_COORDINATION_DIR: context.directory,
              },
              stdout: 'ignore',
              stderr: 'ignore',
            },
          )
          await Bun.sleep(150)
          expect(await Bun.file(marker).exists()).toBe(false)
        },
      })

      expect(await job!.exited).toBe(0)
      expect(await Bun.file(marker).text()).toBe('started')
      await context.waitStarted(2)
    } finally {
      job?.kill('SIGTERM')
      await job?.exited
      await context.close()
    }
  })

  it('waits for an active maintenance job to finish before dumping', async () => {
    const context = await fixture()
    const marker = join(context.directory, 'job-state')
    const job = Bun.spawn(
      [
        '/bin/sh',
        accessScript,
        'job',
        process.execPath,
        '--no-env-file',
        '-e',
        'await Bun.write(' +
          JSON.stringify(marker) +
          ', "started"); await Bun.sleep(500); await Bun.write(' +
          JSON.stringify(marker) +
          ', "finished")',
      ],
      {
        env: {
          ...process.env,
          DB_REPO: 'MONGO',
          BOOKSHOP_DATABASE_COORDINATION_DIR: context.directory,
        },
        stdout: 'ignore',
        stderr: 'ignore',
      },
    )

    try {
      await context.waitStarted(1)
      await waitUntil(() => Bun.file(marker).exists())
      await withDatabaseWritesPaused({
        directory: context.directory,
        run: async () => {
          expect(await Bun.file(marker).text()).toBe('finished')
        },
      })
      expect(await job.exited).toBe(0)
      await context.waitStarted(2)
    } finally {
      job.kill('SIGTERM')
      await job.exited
      await context.close()
    }
  })

  it('releases a killed backup coordinator without leaving a stale pause', async () => {
    const context = await fixture()
    let lease: ReturnType<typeof Bun.spawn> | undefined

    try {
      await context.waitStarted(1)
      const child = Bun.spawn(
        ['setsid', '/bin/sh', accessScript, 'backup', context.directory],
        { stdin: 'pipe', stdout: 'pipe', stderr: 'ignore' },
      )
      lease = child
      const reader = child.stdout.getReader()
      const ready = await reader.read()
      reader.releaseLock()
      expect(new TextDecoder().decode(ready.value).trim()).toBe('READY')
      expect(await context.events()).toEqual(['STARTED', 'DRAINED'])
      process.kill(-lease.pid, 'SIGKILL')
      await lease.exited
      await context.waitStarted(2)
    } finally {
      lease?.kill('SIGKILL')
      await lease?.exited
      await context.close()
    }
  })

  it('retains the writer lease if its supervisor crashes while the application is alive', async () => {
    const context = await fixture()
    let childPid: number | undefined

    try {
      await context.waitStarted(1)
      childPid = Number(await Bun.file(context.childPidFile).text())
      context.writer.kill('SIGKILL')
      await context.writer.exited
      const probe = Bun.spawn(
        ['flock', '-n', '-x', join(context.directory, 'writers.lock'), 'true'],
        { stdout: 'ignore', stderr: 'ignore' },
      )
      expect(await probe.exited).toBe(1)
    } finally {
      if (childPid) {
        process.kill(childPid, 'SIGTERM')
        await waitUntil(async () =>
          (await context.events()).includes('DRAINED'),
        )
      }

      await context.close()
    }
  })

  it('rejects a dump after a writer and its supervisor are killed without cleanup', async () => {
    const context = await fixture()
    let dumped = false

    try {
      await context.waitStarted(1)
      const childPid = Number(await Bun.file(context.childPidFile).text())
      context.writer.kill('SIGKILL')
      process.kill(childPid, 'SIGKILL')
      await context.writer.exited
      await rejects(
        withDatabaseWritesPaused({
          directory: context.directory,
          run: () => {
            dumped = true

            return Promise.resolve()
          },
        }),
      )
      expect(dumped).toBe(false)
    } finally {
      await context.close()
    }
  })

  it.each(
    shells.flatMap((shell) => [false, true].map((watch) => ({ shell, watch }))),
  )(
    'drains writers before dumping and resumes afterward; shell: $shell, watch: $watch',
    async ({ shell, watch }) => {
      const context = await fixture({ shell, watch })

      try {
        await context.waitStarted(1)
        await withDatabaseWritesPaused({
          directory: context.directory,
          run: async () => {
            expect(await context.events()).toEqual(['STARTED', 'DRAINED'])
            await Bun.sleep(150)
            expect(await context.events()).toEqual(['STARTED', 'DRAINED'])
          },
        })
        await context.waitStarted(2)
      } finally {
        await context.close()
      }
    },
  )

  it('resumes writers after a failed dump', async () => {
    const context = await fixture()

    try {
      await context.waitStarted(1)
      await rejects(
        withDatabaseWritesPaused({
          directory: context.directory,
          run: () => Promise.reject(new Error('Dump failed')),
        }),
        /Dump failed/,
      )
      await context.waitStarted(2)
    } finally {
      await context.close()
    }
  })

  it('keeps writers paused until a cancelled dump finishes cleanup', async () => {
    const context = await fixture()
    const controller = new AbortController()

    try {
      await context.waitStarted(1)
      await rejects(
        withDatabaseWritesPaused({
          directory: context.directory,
          signal: controller.signal,
          run: async (signal) => {
            controller.abort(new Error('Backup interrupted'))
            await Bun.sleep(150)
            expect(await context.events()).toEqual(['STARTED', 'DRAINED'])
            signal.throwIfAborted()
          },
        }),
        /Backup interrupted/,
      )
      await context.waitStarted(2)
    } finally {
      await context.close()
    }
  })

  it('refuses to dump after a writer fails to drain', async () => {
    const context = await fixture({ failDrain: true })
    let dumped = false

    try {
      await context.waitStarted(1)
      await rejects(
        withDatabaseWritesPaused({
          directory: context.directory,
          run: () => {
            dumped = true

            return Promise.resolve()
          },
        }),
      )
      expect(dumped).toBe(false)
    } finally {
      await context.close()
    }
  })
})
