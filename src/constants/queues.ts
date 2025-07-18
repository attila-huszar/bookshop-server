export const QUEUE = {
  EMAIL: {
    NAME: 'email',
    JOB: {
      VERIFICATION: 'verification',
      PASSWORD_RESET: 'passwordReset',
      ORDER_CONFIRMATION: 'orderConfirmation',
    },
  },
} as const

export type QueueName = typeof QUEUE.EMAIL.NAME
export type EmailJobType =
  (typeof QUEUE.EMAIL.JOB)[keyof typeof QUEUE.EMAIL.JOB]

export const jobOpts = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
}

export const concurrency = 1
