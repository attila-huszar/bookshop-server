import mongoose from 'mongoose'
import { env } from '@/config/env'
import { DatabaseStartupError, databaseStartupError } from '@/utils/db.utils'
import { log } from '@/libs/logger'
import { databasePolicy } from '@/constants/database'
import { DB_REPO } from '@/types/enums'

let initialized = false
let monitoring = false
let disconnected = false

export async function connect(): Promise<void> {
  if (!env.dbMongoUrl) {
    throw new DatabaseStartupError('MongoDB requires DB_MONGO_URL')
  }

  await mongoose.connect(env.dbMongoUrl, {
    serverSelectionTimeoutMS: databasePolicy.mongoSelectionTimeoutMs,
    socketTimeoutMS: databasePolicy.mongoSocketTimeoutMs,
  })

  const mongoDb = mongoose.connection.db

  if (!mongoDb) {
    throw new DatabaseStartupError('MongoDB connection is not initialized')
  }

  const hello = await mongoDb.admin().command({ hello: 1 })

  if (!hello.setName) {
    throw new DatabaseStartupError(
      'MongoDB requires a replica set for transactional email outbox writes',
    )
  }

  monitorConnection()
  await initializeModels()

  initialized = true
}

export function isReady(): boolean {
  return mongoose.connection.readyState === mongoose.STATES.connected
}

export async function close(): Promise<void> {
  initialized = false
  disconnected = false

  await mongoose.connection.close()
}

function monitorConnection(): void {
  if (monitoring) {
    return
  }

  mongoose.connection.on('error', (error: unknown) => {
    if (initialized) {
      log.error('MongoDB connection error', {
        error: databaseStartupError(error, DB_REPO.MONGO, 'runtime'),
      })
    }
  })

  mongoose.connection.on('disconnected', () => {
    if (initialized && !disconnected) {
      disconnected = true
      log.warn(
        '⚠️ MongoDB disconnected; readiness is unavailable until reconnection',
      )
    }
  })

  mongoose.connection.on('connected', () => {
    if (initialized && disconnected) {
      disconnected = false
      log.info('✅ MongoDB connection recovered; readiness restored')
    }
  })

  monitoring = true
}

async function initializeModels(): Promise<void> {
  const {
    AuthorModel,
    BookModel,
    UserModel,
    OrderModel,
    NewsModel,
    EmailOutboxModel,
    TermsDocumentModel,
  } = await import('@/models/mongo')

  try {
    await Promise.all([
      AuthorModel.init(),
      BookModel.init(),
      UserModel.init(),
      OrderModel.init(),
      NewsModel.init(),
      EmailOutboxModel.init(),
      TermsDocumentModel.init(),
      mongoose.model('Counter').init(),
    ])
  } catch (error) {
    throw databaseStartupError(error, DB_REPO.MONGO, 'schema')
  }
}
