export function getErrorCode(error: unknown): string | number | undefined {
  if (!(error instanceof Error) || !('code' in error)) return undefined

  return typeof error.code === 'string' || typeof error.code === 'number'
    ? error.code
    : undefined
}
