import type { PaymentIntentShipping } from '@/types'

export const defaultCountry = 'hu'
export const defaultCurrency = 'USD'

export const stripeShipping: PaymentIntentShipping = {
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
