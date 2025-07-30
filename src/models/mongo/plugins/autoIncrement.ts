import mongoose from 'mongoose'
import { log } from '@/libs'

type AutoIncrementOptions<T = Record<string, unknown>> = {
  field?: keyof T & string
  startAt?: number
}

const counterSchema = new mongoose.Schema({
  seq: { type: Number, default: 0 },
})

const CounterModel = mongoose.model('Counter', counterSchema)

async function getNextSequence(name: string, startAt = 1): Promise<number> {
  const counter = await CounterModel.findByIdAndUpdate(
    name,
    { $inc: { seq: true } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )

  if (!counter) {
    return startAt
  }

  if (counter.seq === 1 && startAt > 1) {
    const updatedCounter = await CounterModel.findByIdAndUpdate(
      name,
      { seq: startAt },
      { new: true },
    )
    return updatedCounter?.seq ?? startAt
  }

  return counter.seq
}

export function autoIncrementPlugin<
  T extends Record<string, unknown> = Record<string, unknown>,
>(schema: mongoose.Schema<T>, options: AutoIncrementOptions<T> = {}): void {
  const { field = 'id' as keyof T & string, startAt = 1 } = options

  schema.pre('save', async function (this: mongoose.Document & T, next) {
    if (this.isNew && !this[field]) {
      try {
        const modelName = (this.constructor as typeof mongoose.Model).modelName

        Object.assign(this, {
          [field]: await getNextSequence(modelName, startAt),
        })
      } catch (error) {
        void log.error('Auto-increment error', { error })
        return next(error as Error)
      }
    }
    next()
  })
}
