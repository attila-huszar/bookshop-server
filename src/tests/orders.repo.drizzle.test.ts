import { beforeEach, describe, expect, it, mock } from 'bun:test'

const mockEq = mock(() => 'eq-expression')
const mockInArray = mock(() => 'in-array-expression')

const mockReturning = mock<() => Promise<unknown[]>>(() => Promise.resolve([]))
const mockWhere = mock<
  (expression: unknown) => { returning: typeof mockReturning }
>(() => ({ returning: mockReturning }))
const mockSet = mock<
  (payload: Record<string, unknown>) => { where: typeof mockWhere }
>(() => ({ where: mockWhere }))
const mockUpdate = mock<(table: unknown) => { set: typeof mockSet }>(() => ({
  set: mockSet,
}))

const mockSqlite = {
  update: mockUpdate,
}

const mockOrdersTable = {
  paymentId: 'payment_id_column',
  id: 'id_column',
}

await mock.module('drizzle-orm', () => ({
  eq: mockEq,
  inArray: mockInArray,
}))

await mock.module('@/db', () => ({
  sqlite: mockSqlite,
}))

await mock.module('@/models', () => ({
  default: {
    ordersTable: mockOrdersTable,
  },
}))

const ordersRepo = await import('@/repositories/drizzle/orders.repo')

describe('Drizzle Orders Repo', () => {
  beforeEach(() => {
    mockEq.mockClear()
    mockInArray.mockClear()
    mockUpdate.mockClear()
    mockSet.mockClear()
    mockWhere.mockClear()
    mockReturning.mockClear()
  })

  it('passes update fields through without manual updatedAt mutation', async () => {
    mockReturning.mockResolvedValueOnce([
      { paymentId: 'pi_test_123', updatedAt: new Date() },
    ])

    await ordersRepo.updateOrder('pi_test_123', {
      paymentStatus: 'processing',
    })

    expect(mockUpdate).toHaveBeenCalledWith(mockOrdersTable)
    expect(mockSet).toHaveBeenCalledTimes(1)
    expect(mockEq).toHaveBeenCalledWith(
      mockOrdersTable.paymentId,
      'pi_test_123',
    )

    const setPayload = mockSet.mock.calls[0]?.[0]

    expect(setPayload).toBeDefined()
    if (!setPayload) return

    expect(setPayload).toEqual({
      paymentStatus: 'processing',
    })
  })
})
