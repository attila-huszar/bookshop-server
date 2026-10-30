import { Hono } from 'hono'
import { getAuthorById, getAuthorsByName } from '@/services'
import { API } from '@/constants'
import { HttpErrorCode } from '@/types/enums'

export const authors = new Hono()

authors.get(API.authors.root, async (c) => {
  const query = c.req.query()

  if (!query.name) {
    return c.json([], 200)
  }

  const authorRecords = await getAuthorsByName(query.name)

  return c.json(authorRecords)
})

authors.get(API.authors.byId, async (c) => {
  const id = c.req.param('id')
  const authorRecord = await getAuthorById(Number(id))

  if (!authorRecord) {
    return c.json({ code: HttpErrorCode.NotFound }, 404)
  }

  return c.json(authorRecord)
})
