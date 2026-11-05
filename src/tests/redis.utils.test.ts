import { beforeEach, describe, expect, it } from 'bun:test'
import { EventEmitter } from 'node:events'
import {
  getRedisConnectionHint,
  monitorRedisRecovery,
} from '@/utils/redis.utils'
import { mockLogger } from './test-setup'

describe('getRedisConnectionHint', () => {
  it('recognizes connection codes regardless of case', () => {
    for (const code of [
      'ECONNREFUSED',
      'enotfound',
      'EAI_AGAIN',
      'ETIMEDOUT',
      'ECONNRESET',
      'EPIPE',
      'EHOSTUNREACH',
      'ENETUNREACH',
    ]) {
      const error = Object.assign(new Error('Connection failed'), { code })
      expect(getRedisConnectionHint(error, 'redis://cache:6380')).toBe(
        'Check Redis availability at cache:6380; reconnection is automatic',
      )
    }
  })

  it('still recognizes connection messages without a code', () => {
    expect(getRedisConnectionHint(new Error('Connection is closed'))).toBe(
      'Check Redis availability at localhost:6379; reconnection is automatic',
    )
  })

  it('ignores unrelated errors and non-Error values', () => {
    expect(
      getRedisConnectionHint(
        Object.assign(new Error('Duplicate'), { code: 11000 }),
      ),
    ).toBeNull()
    expect(getRedisConnectionHint({ code: 'ECONNREFUSED' })).toBeNull()
    expect(getRedisConnectionHint(null)).toBeNull()
  })
})

function connection() {
  return Object.assign(new EventEmitter(), { status: 'initializing' as const })
}

describe('Redis recovery monitoring', () => {
  beforeEach(() => {
    mockLogger.warn.mockClear()
    mockLogger.info.mockClear()
  })

  it('reports repeated queue outages separately and ignores unrelated errors', () => {
    const primary = connection()
    const reportError = monitorRedisRecovery({
      name: 'Email queue',
      backend: { connection: primary },
      isClosing: () => false,
    })
    const error = Object.assign(new Error('Redis unavailable'), {
      code: 'ECONNRESET',
    })

    primary.emit('ready')
    expect(mockLogger.info).not.toHaveBeenCalled()
    expect(reportError(error)).toBe(true)
    primary.emit('error', error)
    primary.emit('close')
    expect(reportError(new Error('Invalid job'))).toBe(false)
    reportError(error)
    expect(mockLogger.warn).toHaveBeenCalledTimes(1)

    primary.emit('ready')
    primary.emit('ready')
    expect(mockLogger.info).toHaveBeenCalledTimes(1)

    primary.emit('close')
    expect(mockLogger.warn).toHaveBeenCalledTimes(2)
    primary.emit('ready')
    expect(mockLogger.info).toHaveBeenCalledTimes(2)
  })

  it('waits for both worker connections, including an outage on only one socket', () => {
    const primary = connection()
    const blocking = connection()
    monitorRedisRecovery({
      name: 'Email worker',
      backend: { connection: primary, blockingConnection: blocking },
      isClosing: () => false,
    })
    primary.emit('ready')
    blocking.emit('ready')
    primary.emit('close')
    blocking.emit('close')
    primary.emit('ready')
    expect(mockLogger.info).not.toHaveBeenCalled()
    blocking.emit('ready')
    expect(mockLogger.info).toHaveBeenCalledTimes(1)

    blocking.emit('close')
    primary.emit('ready')
    expect(mockLogger.info).toHaveBeenCalledTimes(1)
    blocking.emit('ready')
    expect(mockLogger.info).toHaveBeenCalledTimes(2)
  })

  it('does not report outages or recovery during intentional shutdown', () => {
    const primary = connection()
    let closing = false
    const reportError = monitorRedisRecovery({
      name: 'Email queue',
      backend: { connection: primary },
      isClosing: () => closing,
    })
    primary.emit('ready')
    primary.emit('close')
    closing = true
    primary.emit('ready')
    primary.emit('close')
    reportError(new Error('Connection is closed'))
    expect(mockLogger.warn).toHaveBeenCalledTimes(1)
    expect(mockLogger.info).not.toHaveBeenCalled()
  })
})
