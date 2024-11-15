import ngrok from '@ngrok/ngrok'

export async function ngrokForward() {
  const listener = await ngrok.forward({
    addr: Bun.env.PORT ?? 5000,
    authtoken: Bun.env.NGROK_AUTHTOKEN,
    domain: Bun.env.NGROK_DOMAIN,
  })

  console.log(`Ingress established at: ${listener.url()}`)
}
