import { AuthorModel } from '@/models/mongo'
import { NotFound } from '@/errors'
import type {
  Author,
  AuthorInsert,
  AuthorReference,
  AuthorUpdate,
} from '@/types'

export async function getAllAuthors(): Promise<Author[]> {
  const authors = await AuthorModel.find().lean().exec()

  return authors
}

export async function getAuthorById(
  authorId: number,
): Promise<AuthorReference> {
  const author = await AuthorModel.findOne(
    { id: authorId },
    { id: true, name: true },
  )
    .lean()
    .exec()

  if (!author) {
    throw new NotFound(`Author with id ${authorId} not found`)
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
    {
      name: {
        $regex: searchString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        $options: 'i',
      },
    },
    { id: true, name: true },
  )
    .lean()
    .exec()

  return authors.map((author) => ({
    id: author.id,
    name: author.name,
  }))
}

export async function insertAuthor(author: AuthorInsert): Promise<Author> {
  const created = await AuthorModel.create(author)
  const authorObj = created.toObject()

  return authorObj
}

export async function updateAuthor(
  authorId: number,
  author: AuthorUpdate,
): Promise<Author | null> {
  const updatedAuthor = await AuthorModel.findOneAndUpdate(
    { id: authorId },
    author,
    { returnDocument: 'after' },
  )
    .lean()
    .exec()

  if (!updatedAuthor) {
    return null
  }

  return updatedAuthor
}

export async function hardDeleteAuthors(
  authorIds: number[],
): Promise<Author['id'][]> {
  await AuthorModel.deleteMany({ id: { $in: authorIds } }).exec()

  return authorIds
}
