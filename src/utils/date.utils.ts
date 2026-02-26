export const toIsoString = (
  value: Date | string | null | undefined,
): string | null => {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return null
  return parsedDate.toISOString()
}

export const formatUptime = (nanoseconds: number): string => {
  const seconds = Math.floor(nanoseconds / 1e9)
  const days = Math.floor(seconds / (24 * 3600))
  const hours = Math.floor((seconds % (24 * 3600)) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const result = []
  if (days > 0) result.push(`${days} days`)
  if (hours > 0) result.push(`${hours} hours`)
  if (minutes > 0) result.push(`${minutes} minutes`)
  if (secs > 0 || result.length === 0) result.push(`${secs} seconds`)

  return result.join(' ')
}
