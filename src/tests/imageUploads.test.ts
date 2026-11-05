import { describe, expect, it } from 'bun:test'
import { rejects } from 'node:assert/strict'
import sharp from 'sharp'
import { imageSchema } from '@/validation/commonSchemas'
import { prepareImage } from '@/utils/image.utils'
import { MAX_IMAGE_SIZE_BYTES } from '@/constants/fileLimits'
import { UserErrorCode } from '@/types/enums'

describe('image upload validation and normalization', () => {
  it.each(['png', 'jpeg', 'webp', 'gif', 'avif', 'tiff'] as const)(
    'decodes genuine %s images and stores WebP',
    async (format) => {
      const bytes = await sharp({
        create: { width: 2, height: 2, channels: 4, background: 'red' },
      })
        .toFormat(format)
        .toBuffer()
      const output = await prepareImage(
        new File([new Uint8Array(bytes)], `cover.${format}`, {
          type: `image/${format}`,
        }),
      )

      expect(output.type).toBe('image/webp')
      expect((await sharp(await output.arrayBuffer()).metadata()).format).toBe(
        'webp',
      )
    },
  )

  it('preserves animated GIF frames when converting to WebP', async () => {
    const frames = await Promise.all(
      ['red', 'blue'].map((background) =>
        sharp({ create: { width: 2, height: 2, channels: 4, background } })
          .png()
          .toBuffer(),
      ),
    )
    const gif = await sharp(frames, { join: { animated: true } })
      .gif({ delay: [100, 100] })
      .toBuffer()
    const output = await prepareImage(
      new File([new Uint8Array(gif)], 'animated.gif', { type: 'image/gif' }),
    )

    expect(
      (await sharp(await output.arrayBuffer(), { animated: true }).metadata())
        .pages,
    ).toBe(2)
  })

  it('rasterizes SVG content instead of publishing the original markup', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><script>alert(1)</script><rect width="16" height="16" fill="red"/></svg>'
    const output = await prepareImage(
      new File([svg], 'cover.svg', { type: 'image/svg+xml' }),
    )

    expect(output.type).toBe('image/webp')
    expect((await sharp(await output.arrayBuffer()).metadata()).width).toBe(16)
  })

  it('rejects text and truncated data even when labeled as PNG', async () => {
    for (const bytes of [
      Buffer.from('not an image'),
      Buffer.from('89504e470d0a1a0a', 'hex'),
    ]) {
      await rejects(
        prepareImage(new File([bytes], 'cover.png', { type: 'image/png' })),
        { code: UserErrorCode.InvalidImage, status: 400 },
      )
    }
  })

  it('detects image contents without depending on the filename or image MIME subtype', async () => {
    const jpeg = await sharp({
      create: { width: 1, height: 1, channels: 3, background: 'white' },
    })
      .jpeg()
      .toBuffer()

    const output = await prepareImage(
      new File([new Uint8Array(jpeg)], 'upload', { type: 'image/png' }),
    )

    expect(output.type).toBe('image/webp')
  })

  it('bounds decoded pixels even for very small compressed inputs', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="10000" height="10000"><rect width="10000" height="10000"/></svg>'

    await rejects(
      prepareImage(new File([svg], 'huge.svg', { type: 'image/svg+xml' })),
      { code: UserErrorCode.InvalidImage },
    )
  })

  it('uses the same 1 MiB, non-empty and image MIME contract as the client', () => {
    expect(
      imageSchema.safeParse(
        new File([new Uint8Array(MAX_IMAGE_SIZE_BYTES)], 'cover.png', {
          type: 'image/png',
        }),
      ).success,
    ).toBe(true)
    expect(
      imageSchema.safeParse(
        new File([new Uint8Array(MAX_IMAGE_SIZE_BYTES + 1)], 'cover.png', {
          type: 'image/png',
        }),
      ).success,
    ).toBe(false)
    expect(
      imageSchema.safeParse(new File([], 'cover.png', { type: 'image/png' }))
        .success,
    ).toBe(false)
    expect(
      imageSchema.safeParse(
        new File(['data'], 'cover.avif', { type: 'image/avif' }),
      ).success,
    ).toBe(true)
    expect(
      imageSchema.safeParse(
        new File(['data'], 'cover.png', { type: 'image/jpeg' }),
      ).success,
    ).toBe(true)
    expect(
      imageSchema.safeParse(
        new File(['data'], 'cover.png', { type: 'text/plain' }),
      ).success,
    ).toBe(false)
  })
})
