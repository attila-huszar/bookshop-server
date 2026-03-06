import ngrok from '@ngrok/ngrok'
import { env } from '@/config'

let listener: Awaited<ReturnType<typeof ngrok.forward>> | undefined

export async function ngrokForward() {
  if (listener) return

  listener = await ngrok.forward({
    addr: 'nginx:80',
    authtoken: env.ngrokAuthToken,
    domain: env.ngrokDomain,
  })

  console.log(`Ingress established at: ${listener.url()}`)
}

export async function closeNgrokTunnel(): Promise<void> {
  if (!listener) return

  await listener.close()
  listener = undefined
}
