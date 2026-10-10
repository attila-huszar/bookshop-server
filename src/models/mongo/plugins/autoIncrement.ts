import mongoose, { type ClientSession, type Model, type Schema } from 'mongoose'
import { log } from '@/libs'

type AutoIncrementDoc = {
  isNew: boolean
  id?: number
  $model<T>(): Model<T>
  $session(): ClientSession | null
}

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
})

const CounterModel = mongoose.model('Counter', counterSchema)

async function getNextSequence<T>(
  model: Model<T>,
  session?: ClientSession | null,
): Promise<number> {
  try {
    const counter = await CounterModel.findByIdAndUpdate(
      model.modelName,
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true, ...(session && { session }) },
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
  // Required IDs must exist before Mongoose validates a new document.
  schema.pre('validate', async function (this: AutoIncrementDoc) {
    if (this.isNew && this.id == null) {
      this.id = await getNextSequence(this.$model(), this.$session())
    }
  })
}
