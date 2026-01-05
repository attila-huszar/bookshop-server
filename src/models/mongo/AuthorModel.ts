import { mongo } from '@/db'
import { autoIncrementPlugin } from './'
import type { Author } from '@/types'

type AuthorDoc = WithDateTimestamps<Author>

const authorSchema = new mongo.Schema<AuthorDoc>(
  {
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true },
    fullName: { type: String, required: true },
    birthYear: { type: String, required: true },
    deathYear: { type: String, required: true },
    homeland: { type: String, required: true },
    biography: { type: String, required: true },
  },
  { timestamps: true },
)

authorSchema.plugin(autoIncrementPlugin)

export const AuthorModel = mongo.model<AuthorDoc>('Author', authorSchema)
