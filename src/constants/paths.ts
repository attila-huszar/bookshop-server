export const API = {
  root: '/',
  health: '/health',
  favicon: '/favicon.ico',
  api: '/api',
  webhooks: {
    root: '/webhooks',
    stripe: '/stripe',
  },
  books: {
    root: '/books',
  },
  authors: {
    root: '/authors',
    byId: '/authors/:id',
  },
  news: {
    root: '/news',
  },
  searchOptions: {
    root: '/search_opts',
  },
  users: {
    root: '/users',
    login: '/users/login',
    logout: '/users/logout',
    refresh: '/users/refresh',
    register: '/users/register',
    verification: '/users/verification',
    passwordResetRequest: '/users/password-reset-request',
    passwordResetToken: '/users/password-reset-token',
    passwordResetSubmit: '/users/password-reset-submit',
    profile: '/users/profile',
    avatar: '/users/avatar',
    country: '/users/country',
    countryCodes: '/users/country-codes',
  },
  orders: {
    root: '/orders',
  },
  payments: {
    root: '/payments',
    byId: '/payments/:paymentId',
    byIdWildcard: '/payments/:paymentId/*',
    orderSync: '/payments/:paymentId/order-sync',
  },
  cms: {
    root: '/cms',
    wildcard: '/cms/*',
    books: '/cms/books',
    authors: '/cms/authors',
    orders: '/cms/orders',
    users: '/cms/users',
    productImage: '/cms/product-image',
  },
  logs: {
    root: '/logs',
  },
} as const

export const MIGRATIONS_DIR = './src/database/migrations'
export const MODELS_DIR = './src/models'
