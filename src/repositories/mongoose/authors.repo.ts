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
    ...author,
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
    throw new Error(`Author with id ${authorId} not found`)
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
  const { id, createdAt, updatedAt, ...authorData } = author
  const created = await AuthorModel.create(authorData)
  const authorObj = created.toObject()
  return {
    ...authorObj,
    createdAt: authorObj.createdAt.toISOString(),
    updatedAt: authorObj.updatedAt.toISOString(),
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
    ...updated,
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
