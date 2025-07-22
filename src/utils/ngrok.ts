import ngrok from '@ngrok/ngrok'
import { env } from '@/config'

export async function ngrokForward() {
  const listener = await ngrok.forward({
    addr: env.port,
    authtoken: env.ngrokAuthToken,
    domain: env.ngrokDomain,
  })

  console.log(`Ingress established at: ${listener.url()}`)
}
