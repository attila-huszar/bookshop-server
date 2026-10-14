import { describe, expect, it } from 'bun:test'
import { resolve } from 'node:path'

describe('structured logging', () => {
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
