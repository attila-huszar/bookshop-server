import type { z } from 'zod'

/** Custom validators must output values compatible with their database columns. */
export type SchemaRefinements<Row> = {
  [Field in keyof Row]?: z.ZodType<Row[Field]>
}
