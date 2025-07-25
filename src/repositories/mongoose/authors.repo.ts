import { AuthorModel } from '@/models/mongo'
import type {
  Author,
  AuthorCreate,
  AuthorUpdate,
  AuthorReference,
} from '@/types'

export async function getAllAuthors(): Promise<Author[]> {
  const authors = await AuthorModel.find().lean()

  return authors.map((author) => ({
    id: author.id!,
    name: author.name,
    fullName: author.fullName ?? null,
    birthYear: author.birthYear ?? null,
    deathYear: author.deathYear ?? null,
    homeland: author.homeland ?? null,
    biography: author.biography ?? null,
    createdAt: author.createdAt.toISOString(),
    updatedAt: author.updatedAt.toISOString(),
  }))
}

export async function getAuthorById(
  authorId: number,
): Promise<AuthorReference> {
  const author = await AuthorModel.findOne(
    { id: authorId },
    { _id: 1, name: 1 },
  ).lean()

  if (!author) {
    throw new Error('Author does not exist')
  }

  return {
    id: author.id!,
    name: author.name,
  }
}

export async function getAuthorsBySearch(
  searchString: string,
): Promise<AuthorReference[]> {
  const authors = await AuthorModel.find(
    { name: { $regex: searchString, $options: 'i' } },
    { _id: 1, name: 1 },
  ).lean()

  return authors.map((author) => ({
    id: author.id!,
    name: author.name,
  }))
}

export async function insertAuthor(author: AuthorCreate): Promise<Author> {
  const created = await AuthorModel.create(author)
  const savedAuthor = created.toObject()

  return {
    id: savedAuthor.id!,
    name: savedAuthor.name,
    fullName: savedAuthor.fullName ?? null,
    birthYear: savedAuthor.birthYear ?? null,
    deathYear: savedAuthor.deathYear ?? null,
    homeland: savedAuthor.homeland ?? null,
    biography: savedAuthor.biography ?? null,
    createdAt: savedAuthor.createdAt.toISOString(),
    updatedAt: savedAuthor.updatedAt.toISOString(),
  }
}

export async function updateAuthor(
  authorId: string,
  author: AuthorUpdate,
): Promise<Author | null> {
  const updated = await AuthorModel.findByIdAndUpdate(authorId, author, {
    new: true,
  }).lean()
  if (!updated) return null

  return {
    id: updated.id!,
    name: updated.name,
    fullName: updated.fullName ?? null,
    birthYear: updated.birthYear ?? null,
    deathYear: updated.deathYear ?? null,
    homeland: updated.homeland ?? null,
    biography: updated.biography ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  }
}

export async function deleteAuthors(authorIds: string[]): Promise<Author[]> {
  const deleted = await AuthorModel.find({ _id: { $in: authorIds } }).lean()
  await AuthorModel.deleteMany({ _id: { $in: authorIds } })

  return deleted.map((author) => ({
    id: author.id!,
    name: author.name,
    fullName: author.fullName ?? null,
    birthYear: author.birthYear ?? null,
    deathYear: author.deathYear ?? null,
    homeland: author.homeland ?? null,
    biography: author.biography ?? null,
    createdAt: author.createdAt.toISOString(),
    updatedAt: author.updatedAt.toISOString(),
  }))
}
