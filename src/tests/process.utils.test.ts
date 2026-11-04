import { describe, expect, it } from 'bun:test'

const root = Bun.fileURLToPath(new URL('../../', import.meta.url))
const lifecycle = new URL('../utils/process.utils.ts', import.meta.url).href

async function exercise(source: string, exitCode: number, markers: string[]) {
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '-e',
      `
    import { runProcess } from ${JSON.stringify(lifecycle)}

    // Windows terminates immediately on kill(); emit the signal event there.
    const signalSelf = signal => {
      if (process.platform === 'win32') {
        process.emit(signal)
      } else {
        process.kill(process.pid, signal)
      }
    }

    setTimeout(() => process.exit(99), 5000).unref()
    ${source}
  `,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        BOOKSHOP_CRON_JOB_DIRECTORY: '',
        LOG_LEVEL: 'info',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])

  expect({ code, stderr }).toEqual({ code: exitCode, stderr: '' })

  let previous = -1

  for (const marker of markers) {
    const position = stdout.indexOf(marker)

    expect(position).toBeGreaterThan(previous)
    previous = position
  }

  return stdout
}

describe('process lifecycle', () => {
  it('unwinds partially acquired resources when startup fails', async () => {
    await exercise(
      `await runProcess({
        name: 'Service',
        shutdownMs: 1000,
        start: async (context) => {
          context.defer('database', () => console.log('DATABASE_CLOSED'))
          context.defer('queue', () => console.log('QUEUE_CLOSED'))
          throw new Error('resource construction failed')
        },
      })`,
      1,
      ['startup failed', 'QUEUE_CLOSED', 'DATABASE_CLOSED'],
    )
  })

  it('closes resources in reverse order after a one-off job', async () => {
    await exercise(
      `await runProcess({
        name: 'Job',
        once: true,
        shutdownMs: 1000,
        start: async (context) => {
          context.defer('database', () => console.log('DATABASE_CLOSED'))
          context.defer('HTTP', () => console.log('HTTP_CLOSED'))
        },
      })`,
      0,
      ['HTTP_CLOSED', 'DATABASE_CLOSED'],
    )
  })

  it('continues cleanup and fails the process when a close operation fails', async () => {
    await exercise(
      `await runProcess({
        name: 'Job',
        once: true,
        shutdownMs: 1000,
        start: async (context) => {
          context.defer('database', () => console.log('DATABASE_CLOSED'))
          context.defer('broken resource', () => {
            throw new Error('close failed')
          })
        },
      })`,
      1,
      ['cleanup failed', 'DATABASE_CLOSED'],
    )
  })

  it('handles SIGTERM while startup is still awaiting a dependency', async () => {
    await exercise(
      `await runProcess({
        name: 'Service',
        shutdownMs: 1000,
        start: async (context) => {
          context.defer('database', () => console.log('DATABASE_CLOSED'))
          setTimeout(() => signalSelf('SIGTERM'), 10)
          await context.wait(new Promise(() => {}))
        },
      })`,
      0,
      ['Service shutting down', 'DATABASE_CLOSED'],
    )
  })

  it('reports an interrupted one-off job as unsuccessful', async () => {
    await exercise(
      `await runProcess({
        name: 'Job',
        once: true,
        shutdownMs: 1000,
        start: async (context) => {
          context.defer('temporary files', () => console.log('FILES_REMOVED'))
          setTimeout(() => signalSelf('SIGINT'), 10)
          await context.wait(new Promise(() => {}))
        },
      })`,
      1,
      ['Job shutting down', 'FILES_REMOVED'],
    )
  })

  it('force-closes and exits unsuccessfully when draining never completes', async () => {
    await exercise(
      `await runProcess({
        name: 'Job',
        once: true,
        shutdownMs: 25,
        start: async (context) => {
          context.force(() => console.log('FORCED_CLOSE'))
          context.defer('stuck resource', () => new Promise(() => {}))
        },
      })`,
      1,
      ['shutdown timed out', 'FORCED_CLOSE'],
    )
  })

  it('cleans up after a running service fails', async () => {
    await exercise(
      `await runProcess({
        name: 'Service',
        shutdownMs: 1000,
        start: async (context) => {
          context.defer('database', () => console.log('DATABASE_CLOSED'))
          setTimeout(() => context.fail(new Error('processing failed')), 10)
        },
      })`,
      1,
      ['stopped unexpectedly', 'DATABASE_CLOSED'],
    )
  })

  it('runs cleanup once when aborting a dependency reports another failure', async () => {
    const output = await exercise(
      `await runProcess({
        name: 'Service',
        shutdownMs: 1000,
        start: async (context) => {
          context.defer('database', () => console.log('DATABASE_CLOSED'))
          context.signal.addEventListener('abort', () =>
            context.fail(new Error('Dependency cancelled')),
          )
          setTimeout(() => context.fail(new Error('Connection lost')), 10)
        },
      })`,
      1,
      ['stopped unexpectedly', 'DATABASE_CLOSED'],
    )

    expect(output.match(/DATABASE_CLOSED/g)).toHaveLength(1)
  })
})
