import { fileURLToPath } from 'node:url'

export const emailLogoFilename = 'bookshop-logo.png'
export const emailLogoFilePath = fileURLToPath(
  new URL(`../resources/images/${emailLogoFilename}`, import.meta.url),
)
export const emailLogoMimeType = 'image/png'
export const emailLogoContentId = 'bookshop-logo-cid'
