import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import mongoose, { type ClientSession, Mongoose } from 'mongoose'

const testMongoose = new Mongoose()
const { autoIncrementPlugin } =
  await import('@/models/mongo/plugins/autoIncrement')

const schema = new testMongoose.Schema({ id: { type: Number, required: true } })

schema.plugin(autoIncrementPlugin)
const Model = testMongoose.model('AutoIncrementTest', schema)
const allocateId = spyOn(mongoose.model('Counter'), 'findByIdAndUpdate')

afterAll(() => allocateId.mockRestore())

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

  it('allocates IDs using the same session as a transactional insert', async () => {
    const session = {
      hasEnded: false,
      once: mock(),
    } as unknown as ClientSession
    const document = new Model()

    document.$session(session)
    await document.validate()
    expect(allocateId).toHaveBeenCalledWith(
      'AutoIncrementTest',
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true, session },
    )
  })

  it('preserves an explicitly supplied seed ID', async () => {
    const document = new Model({ id: 42 })

    await document.validate()
    expect(document.id).toBe(42)
    expect(allocateId).not.toHaveBeenCalled()
  })
})
