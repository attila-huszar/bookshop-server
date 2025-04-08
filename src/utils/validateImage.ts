import { MAX_FILE_SIZE } from '../constants'

export const validateImage = (formDataEntry: FormDataEntryValue | null) => {
  if (!(formDataEntry instanceof File)) {
    return 'Invalid file'
  }

  if (!formDataEntry.type.startsWith('image/')) {
    return 'Invalid file type'
  }

  if (formDataEntry.size > MAX_FILE_SIZE) {
    return 'Image too large (max 512 KB)'
  }

  return formDataEntry
}
