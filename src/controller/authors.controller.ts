import { Hono } from 'hono'
import { errorHandler } from '../errors'
import * as DB from '../repository'

export const authors = new Hono()

authors.get('/', async (c) => {
  try {
    const query = c.req.query()

    const authorRecords = await DB.getAuthorsBySearch(query?.name)

    return c.json(authorRecords)
  } catch (error) {
    return errorHandler(c, error)
  }
})

authors.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const authorRecord = await DB.getAuthorById(Number(id))

    if (!authorRecord) {
      return c.json({ error: 'Author not found' }, 404)
    }

    return c.json(authorRecord)
  } catch (error) {
    return errorHandler(c, error)
  }
})
