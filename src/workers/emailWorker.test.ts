import { describe, it, expect, mock, beforeAll, beforeEach } from 'bun:test'
import { QUEUE } from '../constants'
import type { SendEmailProps } from '../types'

const mockSendEmail = mock()
const mockLogger = {
  info: mock(),
  error: mock(),
}

const mockWorker = {
  on: mock(),
  close: mock(() => Promise.resolve()),
}

const mockIORedis = mock(() => mockWorker)

beforeAll(async () => {
  await mock.module('../libs', () => ({
    sendEmail: mockSendEmail,
    logWorker: mockLogger,
  }))

  await mock.module('ioredis', () => ({
    default: mockIORedis,
  }))

  await mock.module('bullmq', () => ({
    Worker: mock(() => mockWorker),
  }))
})

describe('Email Worker', () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    mockLogger.info.mockClear()
    mockLogger.error.mockClear()
    mockWorker.on.mockClear()
    mockWorker.close.mockClear()
  })

  it('should create worker with correct configuration', async () => {
    const { emailWorker } = await import('./emailWorker')

    expect(emailWorker).toBeDefined()
    expect(mockWorker.on).toHaveBeenCalledWith(
      'completed',
      expect.any(Function),
    )
    expect(mockWorker.on).toHaveBeenCalledWith('failed', expect.any(Function))
  })

  it('should call sendEmail when processing a job', async () => {
    const jobData: SendEmailProps = {
      type: QUEUE.EMAIL.JOB.VERIFICATION,
      toAddress: 'test@example.com',
      toName: 'Test User',
      tokenLink: 'https://example.com/verify?token=abc123',
    }

    mockSendEmail.mockResolvedValueOnce(undefined)
    await mockSendEmail(jobData)

    expect(mockSendEmail).toHaveBeenCalledWith(jobData)
  })

  it('should log success when job completes', () => {
    const jobData: SendEmailProps = {
      type: QUEUE.EMAIL.JOB.VERIFICATION,
      toAddress: 'test@example.com',
      toName: 'Test User',
      tokenLink: 'https://example.com/verify?token=abc123',
    }

    const mockJob = {
      id: '12345',
      name: QUEUE.EMAIL.JOB.VERIFICATION,
      data: jobData,
    }

    mockLogger.info('[WORKER] Email sent successfully', {
      id: mockJob.id,
      name: mockJob.name,
      email: mockJob.data.toAddress,
    })

    expect(mockLogger.info).toHaveBeenCalledWith(
      '[WORKER] Email sent successfully',
      {
        id: '12345',
        name: QUEUE.EMAIL.JOB.VERIFICATION,
        email: 'test@example.com',
      },
    )
  })

  it('should log error when job fails', () => {
    const jobData: SendEmailProps = {
      type: QUEUE.EMAIL.JOB.VERIFICATION,
      toAddress: 'test@example.com',
      toName: 'Test User',
      tokenLink: 'https://example.com/verify?token=abc123',
    }

    const mockJob = {
      id: '12345',
      name: QUEUE.EMAIL.JOB.VERIFICATION,
      data: jobData,
    }

    const mockError = new Error('Email sending failed')

    mockLogger.error('[WORKER] Email sending failed', {
      id: mockJob.id,
      name: mockJob.name,
      email: mockJob.data.toAddress,
      error: mockError,
    })

    expect(mockLogger.error).toHaveBeenCalledWith(
      '[WORKER] Email sending failed',
      {
        id: '12345',
        name: QUEUE.EMAIL.JOB.VERIFICATION,
        email: 'test@example.com',
        error: mockError,
      },
    )
  })
})
