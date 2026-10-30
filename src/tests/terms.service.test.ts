import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { env } from '@/config'
import { authAdminMiddleware } from '@/middleware/authAdmin.middleware'
import { defaultTermsStatements } from '@/constants/defaults'
import { errorHandler } from '@/errors/errorHandler'
import { type TermsDocument, type TermsDocumentInsert, UserRole } from '@/types'
import { mockRepositories, mockTermsDB, mockUsersDB } from './test-setup'

// Reapply service mocks after tests that import the concrete repositories.
await mockRepositories()

const { publishTerms } = await import('@/services/terms.service')
const { cms } = await import('@/controller/cms.controller')
const { terms } = await import('@/controller/terms.controller')
const app = new Hono()
  .onError((error, c) => errorHandler(c, error))
  .use('/cms/*', authAdminMiddleware)
  .route('/', cms)
  .route('/', terms)
const previousSecret = env.jwtAccessSecret
const content = {
  en: 'English terms\nA second paragraph.',
  hu: 'Magyar feltételek\nMásodik bekezdés.',
}
const invalidRequests: unknown[] = [
  { content: { en: '', hu: 'Magyar' } },
  { content: { en: 'English', hu: '   ' } },
  { content: { en: 'English' } },
  { content, version: 'client-version' },
  { content: { ...content, fr: 'French' } },
]

beforeEach(() => {
  env.jwtAccessSecret = 'terms-admin-test-secret'
  mockTermsDB.getCurrentTerms.mockReset().mockResolvedValue(null)
  mockTermsDB.getCurrentTermsVersion.mockReset().mockResolvedValue(null)
  mockTermsDB.deleteUnusedTerms.mockReset().mockResolvedValue(false)
  mockTermsDB.getTermsHistory.mockReset().mockResolvedValue([])
  mockTermsDB.getTermsByVersion.mockReset().mockResolvedValue(null)
  mockTermsDB.publishTerms
    .mockReset()
    .mockImplementation((document: TermsDocumentInsert) => {
      const saved = {
        ...document,
        statements: document.statements ?? defaultTermsStatements,
      }
      mockTermsDB.getTermsByVersion.mockResolvedValue(saved)

      return Promise.resolve(saved)
    })
  mockUsersDB.getActiveUserBy
    .mockReset()
    .mockResolvedValue({ uuid: 'admin', role: UserRole.Admin })
})

afterEach(() => {
  env.jwtAccessSecret = previousSecret
})

async function adminRequest(
  method: string,
  body?: unknown,
  path = '/cms/terms',
) {
  const token = await sign(
    { uuid: 'admin', exp: Math.floor(Date.now() / 1000) + 60 },
    env.jwtAccessSecret!,
    'HS256',
  )

  return await app.request(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

describe('Terms publishing', () => {
  it('deletes an unused publication through the admin endpoint', async () => {
    mockTermsDB.deleteUnusedTerms.mockResolvedValue(true)
    const version = '11111111-1111-4111-8111-111111111111'
    const response = await adminRequest(
      'DELETE',
      undefined,
      `/cms/terms/${version}`,
    )

    expect(response.status).toBe(204)
    expect(mockTermsDB.deleteUnusedTerms).toHaveBeenCalledWith(version)
    expect(mockTermsDB.publishTerms).not.toHaveBeenCalled()
  })

  it('rejects accepted, missing and invalid publications', async () => {
    const version = '11111111-1111-4111-8111-111111111111'
    mockTermsDB.getTermsByVersion.mockResolvedValue({
      version,
      content,
      statements: defaultTermsStatements,
      publishedAt: '2026-10-14T10:00:00.000Z',
    })
    const used = await adminRequest(
      'DELETE',
      undefined,
      `/cms/terms/${version}`,
    )

    expect(used.status).toBe(409)
    expect(await used.json()).toMatchObject({ code: 'TERMS_IN_USE' })
    mockTermsDB.getTermsByVersion.mockResolvedValue(null)
    expect(
      (await adminRequest('DELETE', undefined, `/cms/terms/${version}`)).status,
    ).toBe(404)
    mockTermsDB.deleteUnusedTerms.mockClear()
    expect(
      (await adminRequest('DELETE', undefined, '/cms/terms/invalid')).status,
    ).toBe(400)
    expect(mockTermsDB.deleteUnusedTerms).not.toHaveBeenCalled()
  })

  it('requires admin authentication to delete a publication', async () => {
    const path = '/cms/terms/11111111-1111-4111-8111-111111111111'
    expect((await app.request(path, { method: 'DELETE' })).status).toBe(401)
    mockUsersDB.getActiveUserBy.mockResolvedValue({
      uuid: 'reader',
      role: UserRole.User,
    })
    expect((await adminRequest('DELETE', undefined, path)).status).toBe(403)
    expect(mockTermsDB.deleteUnusedTerms).not.toHaveBeenCalled()
  })

  it('generates a version and timestamp from validated bilingual text', async () => {
    const published = await publishTerms({ content })

    expect(published.content).toEqual(content)
    expect(published.version).toMatch(/^[0-9a-f-]{36}$/)
    expect(Number.isFinite(Date.parse(published.publishedAt))).toBe(true)
    expect(mockTermsDB.publishTerms).toHaveBeenCalledWith({
      version: published.version,
      content,
      publishedAt: published.publishedAt,
    })
    expect(published.statements).toEqual(defaultTermsStatements)
  })

  it('reuses the current version when an identical publish is retried', async () => {
    const published = await publishTerms({ content })
    mockTermsDB.getCurrentTerms.mockResolvedValue(published)

    expect(await publishTerms({ content })).toEqual(published)
    expect(mockTermsDB.publishTerms).toHaveBeenCalledTimes(1)
  })

  it.each(invalidRequests)(
    'rejects incomplete terms and unknown setting fields',
    async (input) => {
      await rejects(publishTerms(input))
      expect(mockTermsDB.publishTerms).not.toHaveBeenCalled()
    },
  )

  it('allows an admin to publish and customers to download the exact saved language', async () => {
    const response = await adminRequest('POST', { content })
    expect(response.status).toBe(200)
    const published = (await response.json()) as TermsDocument
    const publicResponse = await app.request(`/terms/${published.version}`)
    const download = await app.request(
      `/terms/${published.version}?download=true&language=hu`,
    )

    expect(publicResponse.status).toBe(200)
    expect(await publicResponse.json()).toEqual(published)
    expect(await download.text()).toBe(content.hu)
    expect(download.headers.get('content-type')).toContain('text/plain')
    expect(download.headers.get('content-disposition')).toMatch(
      /^attachment; filename="terms-\d{4}-\d{2}-\d{2}-hu\.txt"$/,
    )
  })

  it.each([
    ['2026-10-26T23:12:00.000Z', '2026-10-27', 'en'],
    ['2026-07-01T22:15:00.000Z', '2026-07-02', 'hu'],
  ] as const)(
    'names downloads after the Budapest publication date for %s in %s (%s)',
    async (publishedAt, date, language) => {
      const version = '11111111-1111-4111-8111-111111111111'
      mockTermsDB.getTermsByVersion.mockResolvedValue({
        version,
        content,
        statements: defaultTermsStatements,
        publishedAt,
      })
      const response = await app.request(
        `/terms/${version}?download=true&language=${language}`,
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-disposition')).toBe(
        `attachment; filename="terms-${date}-${language}.txt"`,
      )
      expect(await response.text()).toBe(content[language])
    },
  )

  it.each([null, '11111111-1111-4111-8111-111111111111'])(
    'returns only the current version for a quiet checkout check (%s)',
    async (version) => {
      mockTermsDB.getCurrentTermsVersion.mockResolvedValue(version)
      const response = await app.request('/terms/current-version')

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({ version })
      expect(mockTermsDB.getCurrentTerms).not.toHaveBeenCalled()
      expect(mockTermsDB.getTermsByVersion).not.toHaveBeenCalled()
    },
  )

  it('reports an unpublished configuration in the CMS and public endpoint', async () => {
    expect(await (await adminRequest('GET')).json()).toBeNull()
    expect(
      await (await adminRequest('GET', undefined, '/cms/terms/history')).json(),
    ).toEqual([])
    expect(await (await app.request('/terms')).json()).toBeNull()
  })

  it('lists publication metadata for admins without publishing or changing the current terms', async () => {
    const history = [
      {
        version: 'newer',
        publishedAt: '2026-10-15T10:00:00.000Z',
        canDelete: true,
      },
      {
        version: 'older',
        publishedAt: '2026-10-14T10:00:00.000Z',
        canDelete: false,
      },
    ]
    mockTermsDB.getTermsHistory.mockResolvedValue(history)
    const response = await adminRequest('GET', undefined, '/cms/terms/history')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual(history)
    expect(mockTermsDB.publishTerms).not.toHaveBeenCalled()
  })

  it('restricts publication history to authenticated admins', async () => {
    expect((await app.request('/cms/terms/history')).status).toBe(401)
    mockUsersDB.getActiveUserBy.mockResolvedValue({
      uuid: 'reader',
      role: UserRole.User,
    })

    expect(
      (await adminRequest('GET', undefined, '/cms/terms/history')).status,
    ).toBe(403)
    expect(mockTermsDB.getTermsHistory).not.toHaveBeenCalled()
  })

  it.each(['GET', 'POST'])(
    'requires authentication for CMS terms: %s',
    async (method) => {
      const response = await app.request('/cms/terms', {
        method,
        body: method === 'POST' ? JSON.stringify({ content }) : undefined,
      })

      expect(response.status).toBe(401)
      expect(mockTermsDB.publishTerms).not.toHaveBeenCalled()
    },
  )

  it('rejects non-admin writes', async () => {
    mockUsersDB.getActiveUserBy.mockResolvedValue({
      uuid: 'reader',
      role: UserRole.User,
    })

    expect((await adminRequest('POST', { content })).status).toBe(403)
    expect(mockTermsDB.publishTerms).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing archive and validates version identifiers', async () => {
    expect(
      (await app.request('/terms/11111111-1111-4111-8111-111111111111')).status,
    ).toBe(404)
    expect((await app.request('/terms/invalid')).status).toBe(400)
  })
})
