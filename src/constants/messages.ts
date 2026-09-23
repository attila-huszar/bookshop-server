export const userMessage = {
  noSession: 'Session unavailable',
  verifyFirst: 'Please verify your email address before logging in.',
  emailTaken: 'Email address is already registered.',
  emailSendFailed:
    'We could not send the email right now. Please try again later.',
  notFound: 'User account was not found.',
  createFailed:
    'We could not create your account right now. Please try again later.',
  updateFailed:
    'We could not save your account changes right now. Please try again later.',
  forgotPasswordRequest:
    "If you're registered with us, you'll receive a password reset link shortly.",
  passwordResetSuccess: 'Password successfully reset.',
} as const

export const authMessage = {
  credentialsInvalid: 'Invalid credentials. Please try again.',
  mfaStateUpdateError:
    'We could not complete sign-in right now. Please try again later.',
  logoutFailed: 'We could not sign you out right now. Please try again later.',
  registerFailed:
    'We could not complete registration right now. Please try again later.',
  mfaCodeError: 'The OTP code you entered is incorrect.',
  mfaCodeExpired: 'The OTP code has expired. Please sign in again.',
  mfaDeliveryUnavailable:
    'MFA code delivery is temporarily unavailable. Please try again later.',
  verifyEmailFailed:
    'We could not verify your email right now. Please try again later.',
  passwordResetRequestFailed:
    'We could not start password reset right now. Please try again later.',
  passwordResetSubmitFailed:
    'We could not reset your password right now. Please try again later.',
  tokenVerifyFailed:
    'We could not verify the token right now. Please try again later.',
  invalidToken: 'The token provided is either expired or invalid.',
} as const

export const paymentMessage = {
  paymentError: 'Error processing payment',
  paymentSuccess: 'Payment processed successfully',
  paymentFailed: 'Payment failed',
  paymentPending: 'Payment is pending, please check back later',
  paymentCancelled: 'Payment has been cancelled',
  paymentAlreadyCanceled: 'Payment already canceled',
  paymentCannotCancelSucceeded: 'Cannot cancel a successful payment',
  paymentRefunded: 'Payment has been refunded',
  paymentDeclined: 'Payment has been declined',
  priceUpdatedInCart:
    'Prices have been updated in your cart. Please review before checkout.',
} as const

export const commonMessage = {
  fieldsRequired: 'Required fields missing',
  unknown: 'Unknown error occurred',
} as const
