import { Hono } from 'hono'
import { getAuthorById, getAuthorsByName } from '../services'
import { errorHandler } from '../errors'

export const authors = new Hono()

authors.get('/', async (c) => {
  try {
    const query = c.req.query()
    const authorRecords = await getAuthorsByName(query.name)

    return c.json(authorRecords)
  } catch (error) {
    return errorHandler(c, error)
  }
})

authors.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const authorRecord = await getAuthorById(Number(id))

    if (!authorRecord) {
      return c.json({ error: 'Author not found' }, 404)
    }

    return c.json(authorRecord)
  } catch (error) {
    return errorHandler(c, error)
  }
})
