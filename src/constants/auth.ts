import { TimeMs } from '@/constants/time'

export const authTiming = {
  cookieMaxAgeSeconds: (2 * TimeMs.OneWeek) / TimeMs.OneSecond,
  accessTokenSeconds: TimeMs.FifteenMinutes / TimeMs.OneSecond,
  refreshTokenSeconds: (2 * TimeMs.OneWeek) / TimeMs.OneSecond,
  paymentSessionSeconds: TimeMs.OneDay / TimeMs.OneSecond,
  refreshRenewalSeconds: (3 * TimeMs.OneDay) / TimeMs.OneSecond,
  verificationMs: TimeMs.OneDay,
  passwordResetMs: TimeMs.OneDay,
} as const

export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=2,p=1$8a8kB14yJ9/0K1lyKoSyLTael7RKs9kOo6HI/h4/JRc$1I73c4WARj9m6i5J+m84I3HQnS8U0RL0NXaiouSG5A0'
