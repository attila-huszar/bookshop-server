import mongoose from 'mongoose'
import { log } from '@/libs'

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
})

const CounterModel = mongoose.model('Counter', counterSchema)

async function getNextSequence(modelName: string): Promise<number> {
  try {
    const counter = await CounterModel.findByIdAndUpdate(
      modelName,
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    )
    return counter.seq
  } catch (error) {
    log.error('Failed to get next sequence', { modelName, error })
    throw error
  }
}

export async function setSequence<T>(
  model: mongoose.Model<T>,
  value: number,
): Promise<void> {
  await CounterModel.findByIdAndUpdate(
    model.modelName,
    { seq: value },
    { upsert: true },
  )
}

export async function getHighestId<T extends { id?: number | null }>(
  model: mongoose.Model<T>,
): Promise<number> {
  const result = await model.findOne().sort({ id: -1 }).select('id').lean()

  if (!result) return 0

  return typeof result.id === 'number' ? (result.id as number) : 0
}

export function autoIncrementPlugin(schema: mongoose.Schema): void {
  schema.pre('save', async function (this, next) {
    if (this.isNew && !this.id) {
      try {
        const constructor = this.constructor as typeof mongoose.Model
        this.id = await getNextSequence(constructor.modelName)
      } catch (error) {
        log.error('Auto-increment error', { error })
        return next(error as Error)
      }
    }
    next()
  })
}
