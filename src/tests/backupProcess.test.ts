import { describe, expect, it } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { waitForProcessExitWithTimeout } from '@/scripts/shared/backupHelpers'

describe('backup child processes', () => {
  it('terminates and reaps a dump process when the job is interrupted', async () => {
    const child = Bun.spawn(
      [process.execPath, '--no-env-file', '-e', 'setInterval(() => {}, 1000)'],
      { stdout: 'ignore', stderr: 'ignore' },
    )
    const controller = new AbortController()
    const completion = waitForProcessExitWithTimeout(
      'review dump',
      child,
      5000,
      controller.signal,
    )
    controller.abort()
    await rejects(completion, /interrupted/)
    expect(child.signalCode).toBe('SIGTERM')
  })

  it('gives a timed-out dump a graceful termination before escalating', async () => {
    const exited = Promise.withResolvers<number>()
    const signals: (number | NodeJS.Signals | undefined)[] = []
    const child = {
      exited: exited.promise,
      kill: (signal?: number | NodeJS.Signals) => {
        signals.push(signal)
        exited.resolve(143)
      },
    }
    await rejects(
      waitForProcessExitWithTimeout('review dump', child, 1),
      /timed out/,
    )
    expect(signals).toEqual(['SIGTERM'])
  })
})
