import { beforeEach, describe, expect, it } from 'bun:test'
import { rejects } from 'node:assert/strict'
import type { Job, Processor } from 'bullmq'
import { AdminNotification, type SendEmailProps, type User } from '@/types'
import {
  mockLogger,
  mockOrdersDB,
  mockOutboxDB,
  mockSendMail,
  mockUsersDB,
  mockWorker,
  mockWorkerConstructor,
} from './test-setup'

const { createEmailWorker } = await import('@/workers/emailWorker')
createEmailWorker()

type EmailJobResult = { status: 'sent' | 'skipped' }
type EmailJob = Job<SendEmailProps, EmailJobResult>
const processor = mockWorkerConstructor.mock.calls[0]?.[1] as Processor<
  SendEmailProps,
  EmailJobResult
>
const completed = mockWorker.on.mock.calls.find(
  ([event]) => event === 'completed',
)?.[1] as (job: EmailJob, result: EmailJobResult) => void
const failed = mockWorker.on.mock.calls.find(
  ([event]) => event === 'failed',
)?.[1] as (job: EmailJob | undefined, error: Error) => void
const ready = mockWorker.on.mock.calls.find(
  ([event]) => event === 'ready',
)?.[1] as () => void
const workerError = mockWorker.on.mock.calls.find(
  ([event]) => event === 'error',
)?.[1] as (error: Error) => void

const verification: SendEmailProps = {
  type: 'verification',
  toAddress: 'test@example.com',
  toName: 'Test User',
  tokenLink: 'https://example.com/verify?token=abc123',
}
const verificationJob = {
  id: '12345',
  name: 'verification',
  data: verification,
} as EmailJob
const passwordReset: SendEmailProps = {
  type: 'passwordReset',
  toAddress: 'test@example.com',
  toName: 'Test User',
  tokenLink: 'https://example.com/password-reset?token=reset123',
}
const passwordResetJob = {
  id: 'reset-email',
  name: 'passwordReset',
  data: passwordReset,
} as EmailJob

const currentAccount = (): Partial<User> => ({
  verified: false,
  verificationToken: 'abc123',
  verificationExpires: new Date(Date.now() + 60_000),
  passwordResetToken: 'reset123',
  passwordResetExpires: new Date(Date.now() + 60_000),
})

const alertJob = {
  id: 'paid-alert',
  name: 'adminPaymentNotification',
  data: {
    type: 'adminPaymentNotification',
    notificationType: AdminNotification.Error,
    paymentId: 'pi_paid',
    reconciliation: { orderId: 1, alertId: 'alert-1' },
  },
} as EmailJob

describe('Email Worker', () => {
  beforeEach(() => {
    mockWorker.backend.connection.emit('ready')
    mockWorker.backend.blockingConnection.emit('ready')
    ready()
    mockSendMail.mockReset()
    mockOutboxDB.updateEmailDelivery.mockReset().mockResolvedValue(undefined)
    mockOrdersDB.getOrderById.mockReset()
    mockUsersDB.getActiveUserBy.mockReset()
    mockUsersDB.getActiveUserBy.mockResolvedValue(currentAccount())
    mockLogger.info.mockClear()
    mockLogger.error.mockClear()
    mockLogger.debug.mockClear()
    mockLogger.warn.mockClear()
  })

  it('returns a sent outcome only after sending the email', async () => {
    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      'email',
      expect.any(Function),
      expect.objectContaining({ concurrency: 1, autorun: false }),
    )
    expect(await processor(verificationJob, undefined)).toEqual({
      status: 'sent',
    })
    expect(mockSendMail).toHaveBeenCalledWith(verification)
    expect(mockOutboxDB.updateEmailDelivery.mock.calls).toEqual([
      [
        verificationJob.id,
        { status: 'sending', attempts: 1, nextAttemptAt: null, error: null },
      ],
      [
        verificationJob.id,
        { status: 'sent', attempts: 1, nextAttemptAt: null, error: null },
      ],
    ])
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledWith(
      'email',
      verification.toAddress,
    )
  })

  it('sends a current password-reset email even for a verified account', async () => {
    mockUsersDB.getActiveUserBy.mockResolvedValueOnce({
      ...currentAccount(),
      verified: true,
      verificationToken: null,
      verificationExpires: null,
    })

    expect(await processor(passwordResetJob, undefined)).toEqual({
      status: 'sent',
    })
    expect(mockSendMail).toHaveBeenCalledWith(passwordReset)
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledWith(
      'email',
      passwordReset.toAddress,
    )
  })

  describe.each([
    {
      name: 'verification',
      job: verificationJob,
      tokenField: 'verificationToken',
      expiresField: 'verificationExpires',
    },
    {
      name: 'password-reset',
      job: passwordResetJob,
      tokenField: 'passwordResetToken',
      expiresField: 'passwordResetExpires',
    },
  ] as const)('$name email freshness', ({ job, tokenField, expiresField }) => {
    const obsoleteAccounts: [string, Partial<User> | null][] = [
      ['a deleted account', null],
      ['a replaced token', { [tokenField]: 'replacement-token' }],
      ['a consumed token', { [tokenField]: null, [expiresField]: null }],
      ['an expired token', { [expiresField]: new Date(0) }],
    ]

    it.each(obsoleteAccounts)('skips email for %s', async (_label, fields) => {
      mockUsersDB.getActiveUserBy.mockResolvedValueOnce(
        fields ? { ...currentAccount(), ...fields } : null,
      )

      expect(await processor(job, undefined)).toEqual({ status: 'skipped' })
      expect(mockSendMail).not.toHaveBeenCalled()
      expect(mockOutboxDB.updateEmailDelivery).toHaveBeenLastCalledWith(
        job.id,
        { status: 'skipped', attempts: 1, nextAttemptAt: null, error: null },
      )
    })
  })

  it('propagates account lookup failures so the job can retry', async () => {
    for (const job of [verificationJob, passwordResetJob]) {
      mockUsersDB.getActiveUserBy.mockRejectedValueOnce(
        new Error('DB unavailable'),
      )

      await rejects(processor(job, undefined), /DB unavailable/)
    }

    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('skips a resolved reconciliation alert before SMTP', async () => {
    mockOrdersDB.getOrderById.mockResolvedValueOnce({
      reconciliationAlertId: null,
    })
    const result = await processor(alertJob, undefined)

    expect(result).toEqual({ status: 'skipped' })
    completed(alertJob, result)

    expect(mockOrdersDB.getOrderById).toHaveBeenCalledWith(1)
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Obsolete email skipped',
      expect.objectContaining({ jobId: 'paid-alert', paymentId: 'pi_paid' }),
    )
    expect(
      mockLogger.debug.mock.calls.some(
        ([message]) => message === 'Email sent successfully',
      ),
    ).toBe(false)
  })

  it.each([null, { reconciliationAlertId: 'alert-2' }])(
    'skips an alert when the order is missing or a newer alert replaced it: %p',
    async (order) => {
      mockOrdersDB.getOrderById.mockResolvedValueOnce(order)
      expect(await processor(alertJob, undefined)).toEqual({
        status: 'skipped',
      })
      expect(mockSendMail).not.toHaveBeenCalled()
    },
  )

  it('sends an active reconciliation alert without suppressing paid-order failures', async () => {
    mockOrdersDB.getOrderById.mockResolvedValueOnce({
      paidAt: new Date(),
      reconciliationAlertId: 'alert-1',
    })
    expect(await processor(alertJob, undefined)).toEqual({ status: 'sent' })
    expect(mockSendMail).toHaveBeenCalledWith(alertJob.data)
    expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
  })

  it('retries an order lookup outage without sending or discarding the alert', async () => {
    mockOrdersDB.getOrderById.mockRejectedValueOnce(
      new Error('Database unavailable'),
    )
    await rejects(processor(alertJob, undefined), /Database unavailable/)
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockOutboxDB.updateEmailDelivery).toHaveBeenLastCalledWith(
      alertJob.id,
      expect.objectContaining({ status: 'retrying' }),
    )
  })

  it.each(['sent', 'skipped'] as const)(
    'logs %s outcomes at debug without exposing account links',
    (status) => {
      completed(verificationJob, { status })
      expect(mockLogger.debug).toHaveBeenCalledWith(
        status === 'sent'
          ? 'Email sent successfully'
          : 'Obsolete email skipped',
        { jobId: '12345', type: 'verification' },
      )
      expect(mockLogger.info).not.toHaveBeenCalled()
    },
  )

  it('keeps routine readiness quiet and reports Redis recovery once at info', () => {
    ready()
    expect(mockLogger.debug).toHaveBeenCalledWith('Email worker ready')
    expect(mockLogger.info).not.toHaveBeenCalled()

    const error = Object.assign(new Error('Redis unavailable'), {
      code: 'ECONNREFUSED',
    })
    workerError(error)
    workerError(error)
    expect(mockLogger.warn).toHaveBeenCalledTimes(1)

    // BullMQ's Worker ready event only fires at startup. Reconnects come from
    // its underlying connections, and both must be ready before recovery.
    mockWorker.backend.connection.emit('close')
    mockWorker.backend.blockingConnection.emit('close')
    mockWorker.backend.connection.emit('ready')
    ready()
    expect(mockLogger.info).not.toHaveBeenCalled()

    mockWorker.backend.blockingConnection.emit('ready')
    mockWorker.backend.blockingConnection.emit('ready')
    expect(mockLogger.info).toHaveBeenCalledWith(
      '✅ Email worker Redis connection recovered',
    )
    expect(
      mockLogger.info.mock.calls.filter(
        ([message]) => message === '✅ Email worker Redis connection recovered',
      ),
    ).toHaveLength(1)
  })

  it('logs retryable delivery failures as warnings with the attempt budget', () => {
    const error = new Error('Email sending failed')
    const job = {
      ...verificationJob,
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as EmailJob

    failed(job, error)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Email delivery failed; retry scheduled',
      {
        jobId: '12345',
        type: 'verification',
        attempts: 1,
        maxAttempts: 3,
        error,
      },
    )
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it.each([{ attemptsMade: 3 }, { attemptsMade: 1, finishedOn: 1 }])(
    'draws attention to terminal job failures: %p',
    (state) => {
      const error = new Error('Email sending failed')
      const job = {
        ...verificationJob,
        opts: { attempts: 3 },
        ...state,
      } as EmailJob

      failed(job, error)
      expect(mockLogger.error).toHaveBeenCalledWith(
        '❌ Email delivery failed permanently',
        {
          jobId: '12345',
          type: 'verification',
          attempts: state.attemptsMade,
          maxAttempts: 3,
          error,
        },
      )
      expect(mockLogger.warn).not.toHaveBeenCalled()
    },
  )

  it('records retry eligibility and a generic error without storing provider secrets', async () => {
    const start = Date.now()
    const retryJob = {
      ...verificationJob,
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as EmailJob

    mockSendMail.mockRejectedValueOnce(
      new Error('SMTP password=secret; tokenLink=private'),
    )
    await rejects(processor(retryJob, undefined), /SMTP password/)
    expect(mockOutboxDB.updateEmailDelivery).toHaveBeenLastCalledWith(
      retryJob.id,
      {
        status: 'retrying',
        attempts: 2,
        nextAttemptAt: expect.any(Date) as Date,
        error: 'Email delivery failed',
      },
    )
    const update = mockOutboxDB.updateEmailDelivery.mock.calls[1]?.[1] as {
      nextAttemptAt: Date
    }

    expect(update.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
      start + 10_000,
    )
    expect(
      JSON.stringify(mockOutboxDB.updateEmailDelivery.mock.calls),
    ).not.toContain('secret')
  })

  it('records terminal failure when the last attempt fails', async () => {
    const lastJob = {
      ...verificationJob,
      attemptsMade: 2,
      opts: { attempts: 3 },
    } as EmailJob

    mockSendMail.mockRejectedValueOnce(new Error('SMTP unavailable'))
    await rejects(processor(lastJob, undefined), /SMTP unavailable/)
    expect(mockOutboxDB.updateEmailDelivery).toHaveBeenLastCalledWith(
      lastJob.id,
      {
        status: 'failed',
        attempts: 3,
        nextAttemptAt: null,
        error: 'Email delivery failed',
      },
    )
  })

  it('does not retry an accepted email when saving its outcome fails', async () => {
    const error = new Error('DB unavailable')
    mockOutboxDB.updateEmailDelivery
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error)

    expect(await processor(verificationJob, undefined)).toEqual({
      status: 'sent',
    })
    expect(mockSendMail).toHaveBeenCalledTimes(1)
    expect(mockLogger.error).toHaveBeenCalledWith(
      '❌ Could not record email delivery outcome',
      { jobId: verificationJob.id, status: 'sent', error },
    )
  })

  it('does not send when the initial delivery record cannot be saved', async () => {
    mockOutboxDB.updateEmailDelivery.mockRejectedValueOnce(
      new Error('DB unavailable'),
    )

    await rejects(processor(verificationJob, undefined), /DB unavailable/)
    expect(mockSendMail).not.toHaveBeenCalled()
  })
})
