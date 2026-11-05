import { describe, expect, it, mock } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { collectUnusedImages } from '@/services/imageCleanup.service'

const now = Date.parse('2026-10-29T20:00:00Z')
const prefix = 'product-images/sqlite/'
const first = `${prefix}00000000-0000-4000-8000-000000000001.webp`
const second = `${prefix}00000000-0000-4000-8000-000000000002.webp`
const urlForKey = (key: string) => `https://assets.test/${key}`
const old = new Date(now - 25 * 60 * 60 * 1000).toISOString()
type CleanupInput = Parameters<typeof collectUnusedImages>[0]

function setup() {
  return {
    prefixes: [prefix],
    now,
    urlForKey,
    readReferences: mock<() => Promise<(string | null)[]>>(() =>
      Promise.resolve([]),
    ),
    list: mock<CleanupInput['list']>(() =>
      Promise.resolve({
        contents: [{ key: first, lastModified: old }],
        isTruncated: false,
        nextContinuationToken: undefined,
      }),
    ),
    remove: mock<CleanupInput['remove']>(() => Promise.resolve()),
  }
}

describe('unused image cleanup', () => {
  it('removes abandoned or replaced managed images only after the grace period', async () => {
    const input = setup()
    input.list.mockResolvedValueOnce({
      contents: [
        { key: first, lastModified: old },
        { key: second, lastModified: new Date(now).toISOString() },
        { key: `${prefix}legacy-cover.png`, lastModified: old },
        { key: first.replace('sqlite', 'mongo'), lastModified: old },
        {
          key: first.replace('000000000001', '000000000003'),
          lastModified: 'invalid',
        },
      ],
      isTruncated: false,
      nextContinuationToken: undefined,
    })

    expect(await collectUnusedImages(input)).toBe(1)
    expect(input.remove).toHaveBeenCalledTimes(1)
    expect(input.remove).toHaveBeenCalledWith(first)
  })

  it('retains referenced images including shared URLs with query strings', async () => {
    const input = setup()
    input.readReferences.mockResolvedValue([
      null,
      `${urlForKey(first)}?version=1`,
    ])

    expect(await collectUnusedImages(input)).toBe(0)
    expect(input.remove).not.toHaveBeenCalled()
  })

  it('refreshes references before each deletion and follows listing pagination', async () => {
    const input = setup()
    input.list
      .mockResolvedValueOnce({
        contents: [{ key: first, lastModified: old }],
        isTruncated: true,
        nextContinuationToken: 'next',
      })
      .mockResolvedValueOnce({
        contents: [{ key: second, lastModified: old }],
        isTruncated: false,
        nextContinuationToken: undefined,
      })
    input.readReferences
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([urlForKey(second)])

    expect(await collectUnusedImages(input)).toBe(1)
    expect(input.list).toHaveBeenNthCalledWith(2, prefix, 'next')
    expect(input.readReferences).toHaveBeenCalledTimes(2)
    expect(input.remove).toHaveBeenCalledWith(first)
  })

  it('does not delete anything when reference reads fail', async () => {
    const input = setup()
    input.readReferences.mockRejectedValueOnce(
      new Error('Database unavailable'),
    )

    await rejects(collectUnusedImages(input), /Database unavailable/)
    expect(input.remove).not.toHaveBeenCalled()
  })

  it('reports storage failures for maintenance to retry', async () => {
    const input = setup()
    input.remove.mockRejectedValueOnce(new Error('Storage unavailable'))

    await rejects(collectUnusedImages(input), /Storage unavailable/)
  })
})
