import { randomUUID } from 'node:crypto'
import { termsDB } from '@/repositories'
import {
  publishTermsSchema,
  termsVersionSchema,
} from '@/validation/termsSchemas'
import { BadRequest, NotFound } from '@/errors'
import { TermsErrorCode } from '@/types/enums'

export async function getCurrentTerms() {
  return await termsDB.getCurrentTerms()
}

export async function getCurrentTermsVersion() {
  return { version: await termsDB.getCurrentTermsVersion() }
}

export async function getTermsHistory() {
  return await termsDB.getTermsHistory()
}

export async function deleteTermsVersion(version: string) {
  const validatedVersion = termsVersionSchema.parse(version)
  const deleted = await termsDB.deleteUnusedTerms(validatedVersion)

  if (deleted) {
    return
  }

  if (!(await termsDB.getTermsByVersion(validatedVersion))) {
    throw new NotFound('Terms and conditions version not found')
  }

  throw new BadRequest(
    'Accepted terms and conditions cannot be deleted',
    TermsErrorCode.InUse,
    409,
  )
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
