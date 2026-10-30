export const enum DB_REPO {
  SQLITE = 'SQLITE',
  MONGO = 'MONGO',
}

export enum UserRole {
  Admin = 'admin',
  User = 'user',
}

export const enum IssueCode {
  WEBHOOK_ORDER_SAVE_FAILED = 'WEBHOOK_ORDER_SAVE_FAILED',
  WEBHOOK_MISSING_ORDER = 'WEBHOOK_MISSING_ORDER',
}

export const enum AdminNotification {
  New = 'new',
  Error = 'error',
}

export const enum Folder {
  Avatars = 'avatars',
  ProductImages = 'product-images',
}

export const enum HttpErrorCode {
  BadRequest = 'BAD_REQUEST',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  NotFound = 'NOT_FOUND',
  Internal = 'INTERNAL_ERROR',
  InvalidJson = 'INVALID_JSON',
  PayloadTooLarge = 'PAYLOAD_TOO_LARGE',
  RateLimited = 'RATE_LIMITED',
  Timeout = 'REQUEST_TIMEOUT',
  Validation = 'VALIDATION_ERROR',
}

export const enum AuthErrorCode {
  InvalidCredentials = 'INVALID_CREDENTIALS',
  EmailUnverified = 'EMAIL_UNVERIFIED',
  InvalidToken = 'INVALID_TOKEN',
  CurrentPasswordIncorrect = 'CURRENT_PASSWORD_INCORRECT',
}

export const enum UserErrorCode {
  EmailAlreadyExists = 'EMAIL_ALREADY_EXISTS',
  LastAdminRequired = 'LAST_ADMIN_REQUIRED',
  InvalidImage = 'INVALID_IMAGE',
}

export const enum PaymentErrorCode {
  AccessDenied = 'PAYMENT_ACCESS_DENIED',
  PriceConflict = 'PRICE_CONFLICT',
  CheckoutEnded = 'CHECKOUT_ENDED',
  AlreadyCanceled = 'PAYMENT_ALREADY_CANCELED',
  AlreadySucceeded = 'PAYMENT_ALREADY_SUCCEEDED',
}

export const enum TermsErrorCode {
  InUse = 'TERMS_IN_USE',
  Unavailable = 'TERMS_UNAVAILABLE',
  Changed = 'TERMS_CHANGED',
  AlreadyAccepted = 'TERMS_ALREADY_ACCEPTED',
  NotRecorded = 'TERMS_NOT_RECORDED',
}

/** Application identifiers attached to native Zod custom issues through params.rule. */
export const enum ValidationRule {
  CurrentPasswordRequired = 'CURRENT_PASSWORD_REQUIRED',
  Decimal = 'DECIMAL',
  FilterRange = 'FILTER_RANGE',
  ImageRequired = 'IMAGE_REQUIRED',
}

/** Stable application response codes; native Zod issue codes are separate. */
export type ErrorCode =
  | HttpErrorCode
  | AuthErrorCode
  | UserErrorCode
  | PaymentErrorCode
  | TermsErrorCode
