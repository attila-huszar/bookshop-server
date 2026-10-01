import ngrok from '@ngrok/ngrok'
import { env } from '@/config'

type NgrokListener = Awaited<ReturnType<typeof ngrok.forward>>

let currentListener: NgrokListener | undefined
let forwardPromise: Promise<NgrokListener> | undefined

export function ngrokForward(): Promise<NgrokListener | undefined> {
  if (currentListener) return Promise.resolve(currentListener)
  if (forwardPromise) return forwardPromise

  forwardPromise = ngrok
    .forward({
      addr: 'nginx:80',
      authtoken: env.ngrokAuthToken,
      domain: env.ngrokDomain,
    })
    .then((listener) => {
      currentListener = listener
      console.log(`Ingress established at: ${listener.url()}`)
      return listener
    })
    .finally(() => {
      forwardPromise = undefined
    })

  return forwardPromise
}

export async function closeNgrokTunnel(): Promise<void> {
  await forwardPromise?.catch(() => undefined)

  const listenerToClose = currentListener
  if (!listenerToClose) return

  await listenerToClose.close()

  if (currentListener === listenerToClose) {
    currentListener = undefined
  }
}
