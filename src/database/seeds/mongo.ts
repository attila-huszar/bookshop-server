import type { AnyKeys, Model } from 'mongoose'

export async function seedMongo<T>(
  model: Model<T>,
  values: (AnyKeys<T> & { id: number })[],
) {
  const { getHighestId, setSequence } =
    await import('@/models/mongo/plugins/autoIncrement')
  const existing = await model.find().select('id').lean<{ id?: number }[]>()
  const ids = new Set(existing.map((record) => record.id))
  const missing = values.filter((record) => !ids.has(record.id))

  if (missing.length > 0) {
    await model.create(missing)
  }

  await setSequence(model, await getHighestId(model))

  return { inserted: missing.length, existing: values.length - missing.length }
}
