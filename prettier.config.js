/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import("prettier").Config}
 */
const config = {
  endOfLine: 'lf',
  tabWidth: 2,
  semi: false,
  singleQuote: true,
  plugins: ['@trivago/prettier-plugin-sort-imports'],
  importOrder: [
    '<BUILTIN_MODULES>',
    '<THIRD_PARTY_MODULES>',
    '^@/db$',
    '^@/config(/.*)?$',
    '^@/controller(/.*)?$',
    '^@/middleware(/.*)?$',
    '^@/services(/.*)?$',
    '^@/repositories(/.*)?$',
    '^@/database(/.*)?$',
    '^@/models(/.*)?$',
    '^@/validation(/.*)?$',
    '^@/utils(/.*)?$',
    '^@/libs(/.*)?$',
    '^@/workers(/.*)?$',
    '^@/queues(/.*)?$',
    '^@/constants(/.*)?$',
    '^@/resources(/.*)?$',
    '^@/tests(/.*)?$',
    '^@/errors(/.*)?$',
    '^@/types(/.*)?$',
    '^\\.\\./',
    '^\\./',
  ],
  importOrderSortSpecifiers: true, // Alphabetically sort named imports inside statements
  importOrderGroupNamespaceSpecifiers: true, // Group namespace imports (* as X) separately
  importOrderCaseInsensitive: true, // Case-insensitive sorting
  importOrderSideEffects: false, // Keep side-effect imports at the top
}

export default config
