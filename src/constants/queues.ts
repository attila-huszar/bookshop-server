export const QUEUE = {
  EMAIL: {
    NAME: 'email',
    JOB: {
      VERIFICATION: 'verification',
      PASSWORD_RESET: 'passwordReset',
      ORDER_CONFIRMATION: 'orderConfirmation',
      ADMIN_PAYMENT_NOTIFICATION: 'adminPaymentNotification',
    },
  },
} as const

export const jobOpts = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
}

export const concurrency = 1
