import { randomUUID } from 'node:crypto'
import { termsDB } from '@/repositories'
import {
  publishTermsSchema,
  termsVersionSchema,
} from '@/validation/termsSchemas'
import { NotFound } from '@/errors'

export async function getCurrentTerms() {
  return await termsDB.getCurrentTerms()
}

export async function getTermsByVersion(version: string) {
  const document = await termsDB.getTermsByVersion(
    termsVersionSchema.parse(version),
  )

  if (!document) {
    throw new NotFound('Terms and conditions version not found')
  }

  return document
}

export async function publishTerms(input: unknown) {
  const { content } = publishTermsSchema.parse(input)
  const current = await termsDB.getCurrentTerms()

  if (current?.content.en === content.en && current.content.hu === content.hu) {
    return current
  }

  return await termsDB.publishTerms({
    version: randomUUID(),
    content,
    publishedAt: new Date().toISOString(),
  })
}
