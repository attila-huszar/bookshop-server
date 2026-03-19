import ngrok from '@ngrok/ngrok'
import { env } from '@/config'

let listener: Awaited<ReturnType<typeof ngrok.forward>> | undefined
let inFlightForwarding: Promise<void> | null = null
let inFlightClosing: Promise<void> | null = null

export async function ngrokForward(): Promise<
  Awaited<ReturnType<typeof ngrok.forward>> | undefined
> {
  if (inFlightClosing) await inFlightClosing
  if (listener) return listener
  if (inFlightForwarding) {
    await inFlightForwarding
    return listener
  }

  inFlightForwarding = (async () => {
    listener = await ngrok.forward({
      addr: 'nginx:80',
      authtoken: env.ngrokAuthToken,
      domain: env.ngrokDomain,
    })

    console.log(`Ingress established at: ${listener.url()}`)
  })()

  try {
    await inFlightForwarding
  } finally {
    inFlightForwarding = null
  }

  return listener
}

export async function closeNgrokTunnel(): Promise<void> {
  if (inFlightClosing) {
    await inFlightClosing
    return
  }

  if (inFlightForwarding) {
    await inFlightForwarding.catch(() => null)
  }

  if (!listener) return

  const currentListener = listener
  inFlightClosing = (async () => {
    await currentListener.close()
    if (listener === currentListener) listener = undefined
  })()

  try {
    await inFlightClosing
  } finally {
    inFlightClosing = null
  }
}
