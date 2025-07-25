import mongoose from 'mongoose'
import { log } from '@/libs'

type AutoIncrementOptions = {
  field?: string
  startAt?: number
}

type CounterDocument = {
  _id: string
  seq: number
}

const CounterSchema = new mongoose.Schema<CounterDocument>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
})

const Counter = mongoose.model<CounterDocument>('Counter', CounterSchema)

async function getNextSequence(name: string, startAt = 1): Promise<number> {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )

  if (!counter) {
    return startAt
  }

  if (counter.seq === 1 && startAt > 1) {
    const updatedCounter = await Counter.findByIdAndUpdate(
      name,
      { seq: startAt },
      { new: true },
    )
    return updatedCounter?.seq ?? startAt
  }

  return counter.seq
}

export function autoIncrementPlugin(
  schema: mongoose.Schema,
  options: AutoIncrementOptions = {},
) {
  const { field = 'id', startAt = 1 } = options

  schema.pre('save', async function (next) {
    if (this.isNew && !this[field]) {
      try {
        const modelName = (this.constructor as typeof mongoose.Model).modelName
        this[field] = await getNextSequence(modelName, startAt)
      } catch (error) {
        void log.error('Auto-increment error', { error })
        return next(error as Error)
      }
    }
    next()
  })
}
