export const enum DB_REPO {
  SQLITE = 'SQLITE',
  MONGO = 'MONGO',
}

export enum UserRole {
  Admin = 'admin',
  User = 'user',
}

export const enum IssueCode {
  ORDER_SYNC_DRIFT_PERSIST_FAILED = 'ORDER_SYNC_DRIFT_PERSIST_FAILED',
  ORDER_SYNC_MARKER_PERSIST_FAILED = 'ORDER_SYNC_MARKER_PERSIST_FAILED',
  PAYMENT_CANCEL_PERSIST_FAILED = 'PAYMENT_CANCEL_PERSIST_FAILED',
  WEBHOOK_ORDER_PERSIST_FAILED = 'WEBHOOK_ORDER_PERSIST_FAILED',
  WEBHOOK_MISSING_ORDER = 'WEBHOOK_MISSING_ORDER',
}

export const enum AdminNotification {
  Created = 'created',
  Confirmed = 'confirmed',
  Error = 'error',
}

export const enum Folder {
  Avatars = 'avatars',
  ProductImages = 'product-images',
}
