import type { Model, Schema } from 'mongoose'
import { mongo } from '@/db'
import { log } from '@/libs'

type AutoIncrementDoc = {
  isNew: boolean
  id?: number
  $model<T>(): Model<T>
}

const counterSchema = new mongo.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
})

const CounterModel = mongo.model('Counter', counterSchema)

async function getNextSequence<T>(model: Model<T>): Promise<number> {
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

export async function getHighestId<T>(model: Model<T>): Promise<number> {
  const result = await model
    .findOne()
    .sort({ id: -1 })
    .select('id')
    .lean<{ id?: number | null }>()

  return result?.id ?? 0
}

export function autoIncrementPlugin(schema: Schema): void {
  schema.pre('save', async function (this: AutoIncrementDoc) {
    if (this.isNew && this.id == null) {
      this.id = await getNextSequence(this.$model())
    }
  })
}
