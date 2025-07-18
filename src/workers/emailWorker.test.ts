import { describe, it, expect, mock } from 'bun:test'
import { sendEmail } from '../libs'
import { QUEUE } from '../constants'

void mock.module('../libs', () => ({
  sendEmail: mock(),
}))

describe('emailWorker', () => {
  it('should call sendEmail with correct data', async () => {
    const jobData = {
      type: QUEUE.EMAIL.JOB.VERIFICATION,
      toAddress: 'test@example.com',
      toName: 'Test',
      tokenLink: 'link',
    }
    await sendEmail(jobData)
    expect(sendEmail).toHaveBeenCalledWith(jobData)
  })
})
