import ngrok from '@ngrok/ngrok'
import { env } from '@/config'

type NgrokListener = Awaited<ReturnType<typeof ngrok.forward>>

let currentListener: NgrokListener | undefined
let currentOperation: Promise<void> | null = null

function trackOperation(operation: Promise<void>): Promise<void> {
  const tracked = operation.finally(() => {
    if (currentOperation === tracked) currentOperation = null
  })
  currentOperation = tracked
  return tracked
}

export async function ngrokForward(): Promise<NgrokListener | undefined> {
  if (currentListener) return currentListener

  await trackOperation(
    (currentOperation ?? Promise.resolve())
      .catch(() => null)
      .then(async () => {
        if (currentListener) return

        currentListener = await ngrok.forward({
          addr: 'nginx:80',
          authtoken: env.ngrokAuthToken,
          domain: env.ngrokDomain,
        })

        console.log(`Ingress established at: ${currentListener.url()}`)
      }),
  )
  return currentListener
}

export async function closeNgrokTunnel(): Promise<void> {
  if (!currentListener && !currentOperation) return

  await trackOperation(
    (currentOperation ?? Promise.resolve())
      .catch(() => null)
      .then(async () => {
        const listenerToClose = currentListener
        currentListener = undefined

        if (!listenerToClose) return
        await listenerToClose.close()
      }),
  )
}
