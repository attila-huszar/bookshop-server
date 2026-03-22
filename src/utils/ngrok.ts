import ngrok from '@ngrok/ngrok'
import { env } from '@/config'

type NgrokListener = Awaited<ReturnType<typeof ngrok.forward>>

let currentListener: NgrokListener | undefined
let operationQueue: Promise<void> = Promise.resolve()

async function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const previous = operationQueue
  let release!: () => void
  operationQueue = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous.catch(() => {
    // Ignore previous operation failures so queue processing can continue.
  })

  try {
    return await operation()
  } finally {
    release()
  }
}

export async function ngrokForward(): Promise<NgrokListener | undefined> {
  return runExclusive(async () => {
    if (currentListener) return currentListener

    currentListener = await ngrok.forward({
      addr: 'nginx:80',
      authtoken: env.ngrokAuthToken,
      domain: env.ngrokDomain,
    })

    console.log(`Ingress established at: ${currentListener.url()}`)

    return currentListener
  })
}

export async function closeNgrokTunnel(): Promise<void> {
  await runExclusive(async () => {
    const listenerToClose = currentListener
    if (!listenerToClose) return

    await listenerToClose.close()

    if (currentListener === listenerToClose) {
      currentListener = undefined
    }
  })
}
