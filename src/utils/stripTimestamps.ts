export function stripTimestamps<T extends { createdAt: Date; updatedAt: Date }>(
  entity: T,
): WithoutTS<T> {
  const { createdAt, updatedAt, ...rest } = entity
  return rest
}
