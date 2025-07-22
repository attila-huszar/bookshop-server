import { describe, it, expect, beforeEach } from 'bun:test'
import { mockLogger, mockSendEmail, mockWorker } from './test-setup'
import type { SendEmailProps } from '@/types'

describe('Email Worker', () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    mockLogger.info.mockClear()
    mockLogger.error.mockClear()
    mockWorker.on.mockClear()
    mockWorker.close.mockClear()
  })

  it('should create worker with correct configuration', async () => {
    const { emailWorker } = await import('@/workers/emailWorker')

    expect(emailWorker).toBeDefined()
    expect(mockWorker.on).toHaveBeenCalledWith(
      'completed',
      expect.any(Function),
    )
    expect(mockWorker.on).toHaveBeenCalledWith('failed', expect.any(Function))
  })

  it('should call sendEmail when processing a job', async () => {
    const jobData: SendEmailProps = {
      type: 'verification',
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
      type: 'verification',
      toAddress: 'test@example.com',
      toName: 'Test User',
      tokenLink: 'https://example.com/verify?token=abc123',
    }

    const mockJob = {
      id: '12345',
      name: 'verification',
      data: jobData,
    }

    mockLogger.info('Email sent successfully', {
      id: mockJob.id,
      name: mockJob.name,
      email: mockJob.data.toAddress,
    })

    expect(mockLogger.info).toHaveBeenCalledWith('Email sent successfully', {
      id: '12345',
      name: 'verification',
      email: 'test@example.com',
    })
  })

  it('should log error when job fails', () => {
    const jobData: SendEmailProps = {
      type: 'verification',
      toAddress: 'test@example.com',
      toName: 'Test User',
      tokenLink: 'https://example.com/verify?token=abc123',
    }

    const mockJob = {
      id: '12345',
      name: 'verification',
      data: jobData,
    }

    const mockError = new Error('Email sending failed')

    mockLogger.error('Email sending failed', {
      id: mockJob.id,
      name: mockJob.name,
      email: mockJob.data.toAddress,
      error: mockError,
    })

    expect(mockLogger.error).toHaveBeenCalledWith('Email sending failed', {
      id: '12345',
      name: 'verification',
      email: 'test@example.com',
      error: mockError,
    })
  })
})
