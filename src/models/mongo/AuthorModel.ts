import { mongo } from '@/db'
import { autoIncrementPlugin } from './'

const authorSchema = new mongo.Schema(
  {
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true },
    fullName: { type: String, default: null },
    birthYear: { type: String, default: null },
    deathYear: { type: String, default: null },
    homeland: { type: String, default: null },
    biography: { type: String, default: null },
  },
  { timestamps: true },
)

authorSchema.plugin(autoIncrementPlugin)

export const AuthorModel = mongo.model('Author', authorSchema)
