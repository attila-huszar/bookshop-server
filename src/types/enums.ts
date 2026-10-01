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
  Created = 'created',
  Confirmed = 'confirmed',
  Error = 'error',
}

export const enum Folder {
  Avatars = 'avatars',
  ProductImages = 'product-images',
}
