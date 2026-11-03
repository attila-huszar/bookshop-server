import sharp from 'sharp'
import { imageSchema } from '@/validation/commonSchemas'
import { imageProcessingPolicy } from '@/constants/fileLimits'
import { TimeMs } from '@/constants/time'
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
      limitInputPixels: imageProcessingPolicy.maxInputPixels,
      failOn: 'warning',
    })
    const metadata = await image.metadata()

    if (!metadata.mediaType?.startsWith('image/')) {
      throw new Error('File contents are not an image')
    }

    const output = await image
      .autoOrient()
      .resize({
        width: imageProcessingPolicy.maxDimensionPixels,
        height: imageProcessingPolicy.maxDimensionPixels,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: imageProcessingPolicy.webpQuality })
      .timeout({ seconds: imageProcessingPolicy.timeoutMs / TimeMs.OneSecond })
      .toBuffer()

    return new File([new Uint8Array(output)], 'image.webp', {
      type: 'image/webp',
    })
  } catch {
    throw new BadRequest('Invalid image contents', UserErrorCode.InvalidImage)
  }
}
