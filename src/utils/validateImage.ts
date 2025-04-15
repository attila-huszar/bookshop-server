import { MAX_FILE_SIZE } from '../constants'

export const validateImage = (file: File | null) => {
  if (!file) return

  if (!file.type.startsWith('image/')) {
    return 'Invalid file type'
  }

  if (file.size > MAX_FILE_SIZE) {
    return 'Image too large (max 512 KB)'
  }

  return file
}
