import { mongo } from '@/db'
import { log } from '@/libs'
import type { Schema, Model } from 'mongoose'

const counterSchema = new mongo.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
})

const CounterModel = mongo.model('Counter', counterSchema)

async function getNextSequence(model: Model<unknown>): Promise<number> {
  try {
    const counter = await CounterModel.findByIdAndUpdate(
      model.modelName,
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    )
    return counter.seq
  } catch (error) {
    log.error('Failed to get next sequence', { model, error })
    throw error
  }
}

export async function setSequence<T>(
  model: Model<T>,
  value: number,
): Promise<void> {
  await CounterModel.findByIdAndUpdate(
    model.modelName,
    { seq: value },
    { upsert: true },
  )
}

export async function getHighestId<T extends { id?: number | null }>(
  model: Model<T>,
): Promise<number> {
  const result = await model.findOne().sort({ id: -1 }).select('id').lean()

  if (!result) return 0

  return typeof result.id === 'number' ? (result.id as number) : 0
}

export function autoIncrementPlugin(schema: Schema): void {
  schema.pre('save', async function (this, next) {
    if (this.isNew && this.id == null) {
      try {
        this.id = await getNextSequence(this.$model())
      } catch (error) {
        log.error('Auto-increment error', { error })
        return next(error as Error)
      }
    }
    next()
  })
}
