import mongoose from 'mongoose'
import { log } from '@/libs'

type AutoIncrementOptions = {
  field?: string
  startAt?: number
}

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
})

const CounterModel = mongoose.model('Counter', counterSchema)

async function getHighestId(modelName: string): Promise<number> {
  try {
    const Model = mongoose.models[modelName]

    const result = (await Model.findOne()
      .sort({ id: -1 })
      .select('id')
      .lean()) as { id?: number } | null

    if (!result) return 0

    return result.id ?? 0
  } catch {
    return 0
  }
}

async function getNextSequence(
  modelName: string,
  startAt = 1,
): Promise<number> {
  let counter = await CounterModel.findById(modelName)

  if (!counter) {
    const highestId = await getHighestId(modelName)
    const initialSeq = Math.max(highestId, startAt)
    counter = await CounterModel.create({ _id: modelName, seq: initialSeq + 1 })
    return counter.seq
  }

  const updated = await CounterModel.findByIdAndUpdate(
    modelName,
    { $inc: { seq: true } },
    { new: true },
  )
  return updated!.seq
}

export function autoIncrementPlugin(
  schema: mongoose.Schema,
  options: AutoIncrementOptions = {},
): void {
  const { field = 'id', startAt = 1 } = options

  schema.pre(
    'save',
    async function (this: mongoose.Document & Record<string, unknown>, next) {
      if (this.isNew && !this[field]) {
        try {
          const modelName = (this.constructor as typeof mongoose.Model)
            .modelName
          this[field] = await getNextSequence(modelName, startAt)
        } catch (error) {
          log.error('Auto-increment error', { error })
          return next(error as Error)
        }
      }
      next()
    },
  )
}

export async function setSequence(modelName: string): Promise<void> {
  const highestId = await getHighestId(modelName)

  await CounterModel.findByIdAndUpdate(
    modelName,
    { seq: highestId },
    { upsert: true },
  )
}
