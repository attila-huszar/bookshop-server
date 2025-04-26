export const userMessage = {
  sessionExpired: 'Session expired, please log in',
  verifyFirst: 'Please verify your email address before logging in',
  emailTaken: 'Email address is already registered',
  sendEmail: 'Error sending email, please try again later',
  retrieveError: 'Error retrieving user, please try again later',
  createError: 'Error creating user, please try again later',
  updateError: 'Error updating user, please try again later',
  forgotPasswordRequest:
    "If you're registered with us, you'll receive a password reset link shortly",
  passwordResetSuccess: 'Password reset successfully',
} as const

export const authMessage = {
  authError: 'Email or password is incorrect',
  loginError: 'Error logging in, please try again later',
  logoutError: 'Error logging out, please try again later',
  registerError: 'Error registering, please try again later',
  verifyError: 'Error verifying email, please try again later',
  forgotPasswordError:
    'Error sending password reset email, please try again later',
  resetPasswordError: 'Error resetting password, please try again later',
  verifyTokenError: 'Error verifying token, please try again later',
  invalidToken: 'The provided token is invalid',
  expiredToken: 'The provided token has expired',
} as const

export const paymentMessage = {
  paymentError: 'Error processing payment, please try again later',
  paymentSuccess: 'Payment processed successfully',
  paymentFailed: 'Payment failed, please try again later',
  paymentPending: 'Payment is pending, please check back later',
  paymentCancelled: 'Payment has been cancelled',
  paymentRefunded: 'Payment has been refunded',
  paymentDeclined: 'Payment has been declined',
} as const

export const commonMessage = {
  fieldsRequired: 'Required fields missing',
  unknown: 'Unknown error occurred',
} as const
