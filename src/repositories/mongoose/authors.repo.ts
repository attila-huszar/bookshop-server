import model from '@/models'
import type {
  Author,
  AuthorInsert,
  AuthorUpdate,
  AuthorReference,
} from '@/types'

const { AuthorModel } = model as MongoModel

export async function getAllAuthors(): Promise<Author[]> {
  const authors = await AuthorModel.find().lean()

  return authors.map((author) => ({
    id: author.id,
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
    { id: true, name: true },
  ).lean()

  if (!author) {
    throw new Error('Author does not exist')
  }

  return {
    id: author.id,
    name: author.name,
  }
}

export async function getAuthorsBySearch(
  searchString: string,
): Promise<AuthorReference[]> {
  const authors = await AuthorModel.find(
    { name: { $regex: searchString, $options: 'i' } },
    { id: true, name: true },
  ).lean()

  return authors.map((author) => ({
    id: author.id,
    name: author.name,
  }))
}

export async function insertAuthor(author: AuthorInsert): Promise<Author> {
  const created = await AuthorModel.create(author)
  const savedAuthor = created.toObject()

  return {
    id: savedAuthor.id,
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
  authorId: number,
  author: AuthorUpdate,
): Promise<Author | null> {
  const updated = await AuthorModel.findOneAndUpdate({ id: authorId }, author, {
    new: true,
  }).lean()
  if (!updated) return null

  return {
    id: updated.id,
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

export async function deleteAuthors(
  authorIds: number[],
): Promise<Author['id'][]> {
  await AuthorModel.deleteMany({ id: { $in: authorIds } })

  return authorIds
}
