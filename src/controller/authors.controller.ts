import { Hono } from 'hono'
import { getAuthorById, getAuthorsBySearch } from '../repository'

export const authors = new Hono()

authors.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const authorRecord = await getAuthorById(Number(id))

    if (!authorRecord) {
      return c.json({ error: 'Author not found' }, 404)
    }

    return c.json(authorRecord)
  } catch (error) {
    console.error(error)

    return c.json({ error: 'Internal server error' }, 500)
  }
})

authors.get('/', async (c) => {
  try {
    const query = c.req.query()

    const authorRecords = await getAuthorsBySearch(query?.name)

    return c.json(authorRecords)
  } catch (error) {
    console.error(error)

    return c.json({ error: 'Internal server error' }, 500)
  }
})
