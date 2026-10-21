/**
 * Read a raw string/number code from an Error instance, including database/OS codes.
 * Does not restrict the value to application ErrorCode enums or translate it.
 * Returns undefined for plain objects, missing codes, and unsupported code types.
 */
export function getErrorCode(error: unknown): string | number | undefined {
  if (!(error instanceof Error) || !('code' in error)) return undefined

  return typeof error.code === 'string' || typeof error.code === 'number'
    ? error.code
    : undefined
}
