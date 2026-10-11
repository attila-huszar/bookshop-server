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

const { emailWorker } = await import('@/workers')

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
    mockSendMail.mockReset()
    mockOutboxDB.updateEmailDelivery.mockReset().mockResolvedValue(undefined)
    mockOrdersDB.getOrderById.mockReset()
    mockUsersDB.getActiveUserBy.mockReset()
    mockUsersDB.getActiveUserBy.mockResolvedValue(currentAccount())
    mockLogger.info.mockClear()
    mockLogger.error.mockClear()
    mockWorker.close.mockClear()
  })

  it('creates the worker with completion and failure handlers', () => {
    expect(emailWorker).toBeDefined()
    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      'email',
      expect.any(Function),
      expect.objectContaining({ concurrency: 1, autorun: false }),
    )
    expect(mockWorker.on).toHaveBeenCalledWith(
      'completed',
      expect.any(Function),
    )
    expect(mockWorker.on).toHaveBeenCalledWith('failed', expect.any(Function))
  })

  it('returns a sent outcome only after sending the email', async () => {
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

  const obsoleteVerificationAccounts: [string, Partial<User> | null][] = [
    ['a deleted account', null],
    ['an already-verified account', { verified: true }],
    ['a replaced token', { verificationToken: 'new-token' }],
    ['a consumed token', { verificationToken: null }],
    ['an expired token', { verificationExpires: new Date(0) }],
    ['a missing expiry', { verificationExpires: null }],
    ['an invalid expiry', { verificationExpires: new Date(NaN) }],
  ]

  it.each(obsoleteVerificationAccounts)(
    'skips verification emails for %s',
    async (_label, fields) => {
      mockUsersDB.getActiveUserBy.mockResolvedValueOnce(
        fields ? { ...currentAccount(), ...fields } : null,
      )

      expect(await processor(verificationJob, undefined)).toEqual({
        status: 'skipped',
      })
      expect(mockSendMail).not.toHaveBeenCalled()
      expect(mockOutboxDB.updateEmailDelivery).toHaveBeenLastCalledWith(
        verificationJob.id,
        { status: 'skipped', attempts: 1, nextAttemptAt: null, error: null },
      )
    },
  )

  const obsoleteResetAccounts: [string, Partial<User> | null][] = [
    ['a deleted account', null],
    ['a replaced token', { passwordResetToken: 'new-token' }],
    ['a consumed token', { passwordResetToken: null }],
    ['an expired token', { passwordResetExpires: new Date(0) }],
    ['a missing expiry', { passwordResetExpires: null }],
    ['an invalid expiry', { passwordResetExpires: new Date(NaN) }],
  ]

  it.each(obsoleteResetAccounts)(
    'skips password-reset emails for %s',
    async (_label, fields) => {
      mockUsersDB.getActiveUserBy.mockResolvedValueOnce(
        fields ? { ...currentAccount(), ...fields } : null,
      )

      expect(await processor(passwordResetJob, undefined)).toEqual({
        status: 'skipped',
      })
      expect(mockSendMail).not.toHaveBeenCalled()
    },
  )

  it.each([
    'not-a-url',
    'https://example.com/verify',
    'https://example.com/verify?token=',
  ])('skips account emails with an unusable link: %s', async (tokenLink) => {
    for (const job of [verificationJob, passwordResetJob]) {
      const malformedJob = {
        ...job,
        data: { ...job.data, tokenLink },
      } as EmailJob

      expect(await processor(malformedJob, undefined)).toEqual({
        status: 'skipped',
      })
    }

    expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
    expect(mockSendMail).not.toHaveBeenCalled()
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

  it('logs skipped account emails without exposing their link', async () => {
    mockUsersDB.getActiveUserBy.mockResolvedValueOnce(null)
    const result = await processor(verificationJob, undefined)

    completed(verificationJob, result)

    expect(mockLogger.info).toHaveBeenCalledWith('Obsolete email skipped', {
      jobId: '12345',
      type: 'verification',
    })
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
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Obsolete email skipped',
      expect.objectContaining({ jobId: 'paid-alert', paymentId: 'pi_paid' }),
    )
    expect(
      mockLogger.info.mock.calls.some(
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

  it('logs success from the real completion handler', () => {
    completed(verificationJob, { status: 'sent' })
    expect(mockLogger.info).toHaveBeenCalledWith('Email sent successfully', {
      jobId: '12345',
      type: 'verification',
    })
  })

  it('propagates sending failures instead of returning a sent outcome', async () => {
    const error = new Error('SMTP unavailable')

    mockSendMail.mockRejectedValueOnce(error)
    await rejects(processor(verificationJob, undefined), /SMTP unavailable/)
    expect(mockLogger.info).not.toHaveBeenCalled()
  })

  it('logs errors from the real failure handler', () => {
    const error = new Error('Email sending failed')

    failed(verificationJob, error)
    expect(mockLogger.error).toHaveBeenCalledWith('Email sending failed', {
      jobId: '12345',
      type: 'verification',
      error,
    })
  })

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
    mockOutboxDB.updateEmailDelivery
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('DB unavailable'))

    expect(await processor(verificationJob, undefined)).toEqual({
      status: 'sent',
    })
    expect(mockSendMail).toHaveBeenCalledTimes(1)
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Could not record email delivery outcome',
      { jobId: verificationJob.id, status: 'sent' },
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
