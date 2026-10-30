import sharp from 'sharp'
import { imageSchema } from '@/validation/commonSchemas'
import { BadRequest } from '@/errors/BadRequest'
import { UserErrorCode } from '@/types/enums'

/** Decode every frame and store raster output, including for SVG input. */
export async function prepareImage(file: File): Promise<File> {
  if (!imageSchema.safeParse(file).success) {
    throw new BadRequest('Invalid image', UserErrorCode.InvalidImage)
  }

  try {
    const image = sharp(await file.arrayBuffer(), {
      animated: true,
      limitInputPixels: 10_000_000,
      failOn: 'warning',
    })
    const metadata = await image.metadata()

    if (!metadata.mediaType?.startsWith('image/')) {
      throw new Error('File contents are not an image')
    }

    const output = await image
      .autoOrient()
      .resize({
        width: 2048,
        height: 2048,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .timeout({ seconds: 5 })
      .toBuffer()

    return new File([new Uint8Array(output)], 'image.webp', {
      type: 'image/webp',
    })
  } catch {
    throw new BadRequest('Invalid image contents', UserErrorCode.InvalidImage)
  }
}
