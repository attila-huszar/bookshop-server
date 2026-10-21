import mongoose from 'mongoose'
import { defaultTermsStatements } from '@/constants/defaults'
import type { TermsContent } from '@/types/terms.types'
import { autoIncrementPlugin } from './plugins/autoIncrement'

const localizedTextSchema = new mongoose.Schema(
  {
    en: { type: String, required: true },
    hu: { type: String, required: true },
  },
  { _id: false },
)

const termsDocumentSchema = new mongoose.Schema<{
  id: number
  version: string
  content: TermsContent
  statements: TermsContent
  publishedAt: Date
}>({
  id: { type: Number, required: true, unique: true },
  version: { type: String, required: true, unique: true },
  content: {
    type: localizedTextSchema,
    required: true,
  },
  statements: {
    type: localizedTextSchema,
    required: true,
    default: () => ({ ...defaultTermsStatements }),
  },
  publishedAt: { type: Date, required: true },
})

termsDocumentSchema.plugin(autoIncrementPlugin)

export const TermsDocumentModel = mongoose.model(
  'TermsDocument',
  termsDocumentSchema,
)
