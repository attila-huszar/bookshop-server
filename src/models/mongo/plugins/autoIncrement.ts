import mongoose from 'mongoose'
import { log } from '@/libs'

type AutoIncrementOptions<T = Record<string, unknown>> = {
  field?: keyof T & string
  startAt?: number
}

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
})

const CounterModel = mongoose.model('Counter', counterSchema)

async function getHighestIdFromCollection(
  modelName: string,
  field: string,
): Promise<number> {
  try {
    const Model = mongoose.models[modelName] || mongoose.model(modelName)
    const result = await Model.findOne({}, { [field]: 1 })
      .sort({ [field]: -1 })
      .lean()
      .exec()
    return (result as Record<string, number>)?.[field] ?? 0
  } catch {
    return 0
  }
}

async function getNextSequence(
  name: string,
  startAt = 1,
  field = 'id',
): Promise<number> {
  let counter = await CounterModel.findById(name)

  if (!counter) {
    const highestId = await getHighestIdFromCollection(name, field)
    const initialSeq = Math.max(highestId, startAt - 1)
    counter = await CounterModel.create({ _id: name, seq: initialSeq + 1 })
    return counter.seq
  }

  const updated = await CounterModel.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true },
  )
  return updated!.seq
}

export function autoIncrementPlugin<
  T extends Record<string, unknown> = Record<string, unknown>,
>(schema: mongoose.Schema<T>, options: AutoIncrementOptions<T> = {}): void {
  const { field = 'id' as keyof T & string, startAt = 1 } = options

  schema.pre('save', async function (this: mongoose.Document & T, next) {
    if (this.isNew && !this[field]) {
      try {
        const modelName = (this.constructor as typeof mongoose.Model).modelName
        ;(this as Record<string, number>)[field] = await getNextSequence(
          modelName,
          startAt,
          String(field),
        )
      } catch (error) {
        log.error('Auto-increment error', { error })
        return next(error as Error)
      }
    }
    next()
  })
}

export async function resetCounterFromCollection(
  modelName: string,
  field = 'id',
): Promise<void> {
  try {
    const highestId = await getHighestIdFromCollection(modelName, field)
    await CounterModel.findByIdAndUpdate(
      modelName,
      { seq: highestId },
      { upsert: true },
    )
    log.info(`Counter reset for ${modelName}`, { modelName, field, highestId })
  } catch (error) {
    log.error(`Failed to reset counter for ${modelName}`, {
      error,
      modelName,
      field,
    })
  }
}
