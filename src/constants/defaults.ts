import type { StripeShipping } from '@/types'

export const defaultCountry = 'hu'
export const defaultCurrency = 'USD'

export const stripeShipping: StripeShipping = {
  name: '',
  phone: '',
  address: {
    city: '',
    line1: '',
    line2: '',
    postal_code: '',
    state: '',
    country: '',
  },
}
