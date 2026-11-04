import { describe, expect, it } from 'bun:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const lifecycle = new URL('../utils/processLifecycle.utils.ts', import.meta.url)
  .href

async function exercise(source: string, exitCode: number, markers: string[]) {
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '-e',
      `
    import { runProcess } from ${JSON.stringify(lifecycle)}
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
}

describe('process lifecycle', () => {
  it('unwinds partially acquired resources when startup fails', async () => {
    await exercise(
      `await runProcess({ name: 'Service', shutdownMs: 1000,
      start: async ctx => {
        ctx.defer('database', () => console.log('DATABASE_CLOSED'))
        ctx.defer('queue', () => console.log('QUEUE_CLOSED'))
        throw new Error('resource construction failed')
      },
    })`,
      1,
      ['startup failed', 'QUEUE_CLOSED', 'DATABASE_CLOSED'],
    )
  })

  it('closes resources in reverse order after a one-off job', async () => {
    await exercise(
      `await runProcess({ name: 'Job', once: true, shutdownMs: 1000,
      start: async ctx => {
        ctx.defer('database', () => console.log('DATABASE_CLOSED'))
        ctx.defer('HTTP', () => console.log('HTTP_CLOSED'))
      },
    })`,
      0,
      ['HTTP_CLOSED', 'DATABASE_CLOSED'],
    )
  })

  it('continues cleanup and fails the process when a close operation fails', async () => {
    await exercise(
      `await runProcess({ name: 'Job', once: true, shutdownMs: 1000,
      start: async ctx => {
        ctx.defer('database', () => console.log('DATABASE_CLOSED'))
        ctx.defer('broken resource', () => { throw new Error('close failed') })
      },
    })`,
      1,
      ['cleanup failed', 'DATABASE_CLOSED'],
    )
  })

  it('handles SIGTERM while startup is still awaiting a dependency', async () => {
    await exercise(
      `await runProcess({ name: 'Service', shutdownMs: 1000,
      start: async ctx => {
        ctx.defer('database', () => console.log('DATABASE_CLOSED'))
        setTimeout(() => process.kill(process.pid, 'SIGTERM'), 10)
        await ctx.wait(new Promise(() => {}))
      },
    })`,
      0,
      ['Service shutting down', 'DATABASE_CLOSED'],
    )
  })

  it('reports an interrupted one-off job as unsuccessful', async () => {
    await exercise(
      `await runProcess({ name: 'Job', once: true, shutdownMs: 1000,
      start: async ctx => {
        ctx.defer('temporary files', () => console.log('FILES_REMOVED'))
        setTimeout(() => process.kill(process.pid, 'SIGINT'), 10)
        await ctx.wait(new Promise(() => {}))
      },
    })`,
      1,
      ['Job shutting down', 'FILES_REMOVED'],
    )
  })

  it('force-closes and exits unsuccessfully when draining never completes', async () => {
    await exercise(
      `await runProcess({ name: 'Job', once: true, shutdownMs: 25,
      start: async ctx => {
        ctx.force(() => console.log('FORCED_CLOSE'))
        ctx.defer('stuck resource', () => new Promise(() => {}))
      },
    })`,
      1,
      ['shutdown timed out', 'FORCED_CLOSE'],
    )
  })

  it('cleans up after a running service fails', async () => {
    await exercise(
      `await runProcess({ name: 'Service', shutdownMs: 1000,
      start: async ctx => {
        ctx.defer('database', () => console.log('DATABASE_CLOSED'))
        setTimeout(() => ctx.fail(new Error('processing failed')), 10)
      },
    })`,
      1,
      ['stopped unexpectedly', 'DATABASE_CLOSED'],
    )
  })
})
