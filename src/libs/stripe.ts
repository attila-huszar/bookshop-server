import { Stripe } from 'stripe'
import { env } from '@/config'

let client: Stripe | undefined

export function getStripe(): Stripe {
  client ??= new Stripe(env.stripeSecret!)

  return client
}
