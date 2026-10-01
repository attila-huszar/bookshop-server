import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { Mongoose } from 'mongoose'

const mongo = new Mongoose()
await mock.module('@/db', () => ({
  mongo,
  sqlite: undefined,
  sqliteClient: undefined,
}))
const { autoIncrementPlugin } =
  await import('@/models/mongo/plugins/autoIncrement')

const schema = new mongo.Schema({ id: { type: Number, required: true } })
schema.plugin(autoIncrementPlugin)
const Model = mongo.model('AutoIncrementTest', schema)
const allocateId = spyOn(mongo.model('Counter'), 'findByIdAndUpdate')

beforeEach(() => {
  allocateId.mockClear()
  allocateId.mockResolvedValue({ seq: 1 })
})

describe('Mongo auto-increment IDs', () => {
  it('assigns a required ID before validating a new document', async () => {
    const document = new Model()
    await document.validate()
    expect(document.id).toBe(1)
  })

  it('keeps the ID when validating the same document again', async () => {
    const document = new Model()
    await document.validate()
    await document.validate()
    expect(document.id).toBe(1)
    expect(allocateId).toHaveBeenCalledTimes(1)
  })

  it('preserves an explicitly supplied seed ID', async () => {
    const document = new Model({ id: 42 })
    await document.validate()
    expect(document.id).toBe(42)
    expect(allocateId).not.toHaveBeenCalled()
  })
})
