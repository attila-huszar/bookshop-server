import { describe, expect, it } from 'bun:test'
import { resolve } from 'node:path'

describe('structured logging', () => {
  it('preserves nested error causes, including non-error causes', () => {
    const result = Bun.spawnSync({
      cmd: [
        process.execPath,
        '--eval',
        `
          const { log } = await import('./src/libs/logger.ts')
          const cause = new Error('Storage connection failed', { cause: { code: 'ECONNREFUSED' } })
          log.error('Request failed', { error: new Error('Image upload failed', { cause }) })
        `,
      ],
      cwd: resolve(import.meta.dir, '../..'),
      env: { ...process.env, LOG_LEVEL: 'error' },
    })

    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout.toString())).toEqual({
      level: 'error',
      message: 'Request failed',
      meta: {
        error: {
          name: 'Error',
          message: 'Image upload failed',
          stack: expect.stringContaining('Image upload failed') as unknown,
          cause: {
            name: 'Error',
            message: 'Storage connection failed',
            stack: expect.stringContaining(
              'Storage connection failed',
            ) as unknown,
            cause: { code: 'ECONNREFUSED' },
          },
        },
      },
    })
  })

  it('handles circular causes and metadata without dropping repeated references', () => {
    const result = Bun.spawnSync({
      cmd: [
        process.execPath,
        '--eval',
        `
          const { log } = await import('./src/libs/logger.ts')
          const error = new Error('Circular failure')
          error.cause = error
          const details = { orderId: 7 }
          const meta = { error, details: [details, details] }
          meta.self = meta
          log.error('Request failed', meta)
        `,
      ],
      cwd: resolve(import.meta.dir, '../..'),
      env: { ...process.env, LOG_LEVEL: 'error' },
    })

    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout.toString())).toEqual({
      level: 'error',
      message: 'Request failed',
      meta: {
        error: {
          name: 'Error',
          message: 'Circular failure',
          stack: expect.stringContaining('Circular failure') as unknown,
          cause: '[Circular]',
        },
        details: [{ orderId: 7 }, { orderId: 7 }],
        self: '[Circular]',
      },
    })
  })

  it.each([
    { minimum: '', levels: ['info', 'warn', 'error'] },
    { minimum: 'debug', levels: ['debug', 'info', 'warn', 'error'] },
    { minimum: 'warn', levels: ['warn', 'error'] },
  ])(
    'filters logs at the configured minimum: $minimum',
    ({ minimum, levels }) => {
      // A fresh process exercises the real logger without the suite's module mocks.
      const result = Bun.spawnSync({
        cmd: [
          process.execPath,
          '--eval',
          `
          const { frontendLog } = await import('./src/libs/logger.ts')
          frontendLog.debug('debug message')
          frontendLog.info('info message')
          frontendLog.warn('warning message')
          frontendLog.error('error message')
        `,
        ],
        cwd: resolve(import.meta.dir, '../..'),
        env: { ...process.env, LOG_LEVEL: minimum },
      })

      expect(result.exitCode).toBe(0)

      const entries = result.stdout
        .toString()
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as { level: string; source: string })

      expect(entries.map((entry) => entry.level)).toEqual([...levels])
      expect(entries.every((entry) => entry.source === 'frontend')).toBe(true)
    },
  )
})
