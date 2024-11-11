import { Hono } from 'hono'
import { getAuthorById, getAuthorsBySearch } from '../repository'

export const authors = new Hono().basePath('/authors')

authors.get('/:id', async (c) => {
  const id = c.req.param('id')

  const authorRecord = await getAuthorById(Number(id))

  if (!authorRecord) {
    return c.json({ error: 'Author not found' }, 404)
  }

  return c.json(authorRecord)
})

authors.get('/', async (c) => {
  const query = c.req.query()

  const authorRecords = await getAuthorsBySearch(query?.name)

  return c.json(authorRecords)
})
