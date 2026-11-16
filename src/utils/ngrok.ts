import { setTimeout as delay } from 'node:timers/promises'
import ngrok from '@ngrok/ngrok'
import { env } from '@/config'
import { log } from '@/libs/logger'
import { TimeMs } from '@/constants/time'

type NgrokListener = Awaited<ReturnType<typeof ngrok.forward>>

let forwardPromise: Promise<NgrokListener | undefined> | undefined
let controller: AbortController | undefined

export function ngrokForward(): Promise<NgrokListener | undefined> {
  if (forwardPromise) {
    return forwardPromise
  }

  controller = new AbortController()
  const { signal } = controller
  // Cache the successful promise too; shutdown owns the returned listener.
  forwardPromise = connectNgrokTunnel(signal).catch((error: unknown) => {
    forwardPromise = undefined

    if (!signal.aborted) {
      throw error
    }

    return undefined
  })

  return forwardPromise
}

async function connectNgrokTunnel(
  signal: AbortSignal,
): Promise<NgrokListener | undefined> {
  let retryDelayMs: number = TimeMs.FiveSeconds
  let disconnected = false
  let established = false

  while (!signal.aborted) {
    let listener: NgrokListener

    try {
      listener = await ngrok.forward({
        addr: 'nginx:80',
        authtoken: env.ngrokAuthToken,
        domain: env.ngrokDomain,
        onStatusChange: (status) => {
          if (signal.aborted || !established) {
            return
          }

          if (status === 'closed' && !disconnected) {
            disconnected = true
            log.warn('⚠️ Ngrok tunnel disconnected; reconnecting')
          } else if (status === 'connected' && disconnected) {
            disconnected = false
            log.info('✅ Ngrok tunnel connection recovered')
          }
        },
      })
    } catch (error) {
      // Explicit provider rejections require intervention; established
      // sessions use the SDK's own reconnection handling.
      const isProviderRejection = error instanceof Error && 'errorCode' in error

      if (signal.aborted || isProviderRejection) {
        throw error
      }

      disconnected = true
      log.warn('⚠️ Ngrok tunnel connection failed; retry scheduled', {
        error,
        retryDelayMs,
      })

      await delay(retryDelayMs, undefined, { signal })
      retryDelayMs = Math.min(retryDelayMs * 2, TimeMs.OneMinute)

      continue
    }

    if (signal.aborted) {
      await listener.close()

      return
    }

    established = true
    log.info(
      disconnected
        ? '✅ Ngrok tunnel connection recovered'
        : 'Ngrok tunnel established',
      { url: listener.url() },
    )
    disconnected = false

    return listener
  }
}

export async function closeNgrokTunnel(): Promise<void> {
  controller?.abort()
  const pending = forwardPromise
  const listener = await pending?.catch(() => undefined)

  await listener?.close()

  if (forwardPromise === pending) {
    forwardPromise = undefined
  }
}
