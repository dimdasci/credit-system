import { MerchantContext } from "@credit-system/shared"
import { DatabaseManager } from "@server/services/external/DatabaseManager.js"
import { LedgerRepository as LedgerRepositoryService } from "@server/services/repositories/LedgerRepository.js"
import type { LedgerQueryOptions } from "@server/services/repositories/LedgerRepository.js"
import { Effect, Layer } from "effect"
import { TestLedgerEntriesArray, TestLotSummaries } from "../../../fixtures/ledger-test-data.js"

export interface MockQueryContext {
  partition: string | null
  userId: string | null
  atTime: Date | null
  lastHistoryQuery: string
  lastHistoryValues: Array<unknown>
  lastHistoryOptions: LedgerQueryOptions | null
  lastReasonFilter: Array<string> | null
  lastAppliedReasonFilter: Array<string> | null
  historyQueryIncludesCreatedMonth: boolean
  lastInsertValues: Array<unknown> | null
  monthFilters: Array<string>
}

const initialContext = (): MockQueryContext => ({
  partition: null,
  userId: null,
  atTime: null,
  lastHistoryQuery: "",
  lastHistoryValues: [],
  lastHistoryOptions: null,
  lastReasonFilter: null,
  lastAppliedReasonFilter: null,
  historyQueryIncludesCreatedMonth: false,
  lastInsertValues: null,
  monthFilters: []
})

export const mockQueryContext: MockQueryContext = initialContext()

export const resetMockQueryContext = () => {
  Object.assign(mockQueryContext, initialContext())
}

interface InFragment {
  readonly _tag: "InFragment"
  readonly column: string
  readonly values: Array<string>
}

const createInFragment = (column: string, values: Array<string>): InFragment => ({
  _tag: "InFragment",
  column,
  values
})

const isInFragment = (value: unknown): value is InFragment =>
  typeof value === "object" && value !== null && (value as InFragment)._tag === "InFragment"

const mockSqlClient = {
  [Symbol.for("sql-template")]: true,
  raw: (strings: TemplateStringsArray, ...values: Array<unknown>) => {
    mockQueryContext.historyQueryIncludesCreatedMonth = strings.some((segment) => segment.includes("created_month"))
    let query = strings[0] ?? ""
    const resolvedValues: Array<unknown> = []

    for (let i = 0; i < values.length; i++) {
      const value = values[i]

      if (isInFragment(value)) {
        mockQueryContext.lastReasonFilter = value.values
        const column = value.column.length > 0 ? value.column : "reason"
        const placeholders = value.values.map(() => "?").join(", ")
        query += `${column} IN (${placeholders})`
        for (const entry of value.values) {
          resolvedValues.push(entry)
        }
      } else {
        if (value && typeof value === "object") {
          if ("strings" in (value as Record<string, unknown>)) {
            const fragmentStrings = (value as { strings?: ReadonlyArray<string> }).strings
            if (fragmentStrings && fragmentStrings.some((segment) => segment.includes("created_month"))) {
              mockQueryContext.historyQueryIncludesCreatedMonth = true
            }
          }
        } else if (typeof value === "string") {
          if (/^\d{4}-\d{2}-01$/.test(value)) {
            mockQueryContext.historyQueryIncludesCreatedMonth = true
            mockQueryContext.partition = value
            mockQueryContext.monthFilters.push(value)
          }
        }
        query += "?"
        resolvedValues.push(value)
      }

      query += strings[i + 1] ?? ""
    }

    query = query.trim()
    mockQueryContext.lastHistoryQuery = query
    mockQueryContext.lastHistoryValues = resolvedValues
    mockQueryContext.historyQueryIncludesCreatedMonth = query.includes("created_month")

    if (query.includes("AND created_month >= ?") && resolvedValues.length === 1) {
      mockQueryContext.partition = resolvedValues[0] as string
      return Effect.succeed("")
    }

    if (query === "AND user_id = ?" && resolvedValues.length === 1) {
      mockQueryContext.userId = resolvedValues[0] as string
      return Effect.succeed("")
    }

    if (query === "" && resolvedValues.length === 0) {
      return Effect.succeed("")
    }

    if (
      query.includes("SELECT * FROM ledger_entries") &&
      query.includes("WHERE lot_id = ?") &&
      query.includes("AND lot_month = ?") &&
      query.includes("AND entry_id = lot_id") &&
      query.includes("LIMIT 1")
    ) {
      const lotId = resolvedValues[0] as string
      const lotMonth = resolvedValues[1] as string
      const entry = TestLedgerEntriesArray.find((e) =>
        e.lot_id === lotId &&
        e.lot_month === lotMonth &&
        e.entry_id === e.lot_id
      )
      return Effect.succeed(entry ? [entry] : [])
    }

    if (
      query.includes("SELECT * FROM ledger_entries") &&
      query.includes("WHERE user_id = ?") &&
      query.includes("ORDER BY created_at DESC") &&
      !query.includes("WITH lot_balances")
    ) {
      const userId = resolvedValues[0] as string
      const reasonFiltersParam = mockQueryContext.lastReasonFilter ?? undefined

      let userEntries = TestLedgerEntriesArray
        .filter((e) => e.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      if (reasonFiltersParam && reasonFiltersParam.length > 0) {
        userEntries = userEntries.filter((entry) => reasonFiltersParam.includes(entry.reason))
      }

      mockQueryContext.lastAppliedReasonFilter = reasonFiltersParam ?? null
      mockQueryContext.lastReasonFilter = null

      return Effect.succeed(userEntries)
    }

    if (
      query.includes("SELECT COALESCE(SUM(amount), 0) as balance") &&
      query.includes("FROM ledger_entries") &&
      query.includes("WHERE user_id = ?") &&
      !query.includes("lot_id")
    ) {
      const userId = resolvedValues[0] as string
      const balance = TestLedgerEntriesArray
        .filter((e) => e.user_id === userId)
        .reduce((sum, e) => sum + e.amount, 0)

      return Effect.succeed([{ balance }])
    }

    if (
      query.includes("SELECT COALESCE(SUM(amount), 0) as balance") &&
      query.includes("FROM ledger_entries") &&
      query.includes("WHERE lot_id = ? AND lot_month = ?")
    ) {
      const lotId = resolvedValues[0] as string
      const lotMonth = resolvedValues[1] as string
      const balance = TestLedgerEntriesArray
        .filter((e) => e.lot_id === lotId && e.lot_month === lotMonth)
        .reduce((sum, e) => sum + e.amount, 0)

      return Effect.succeed([{ balance }])
    }

    if (
      query.includes("WITH lot_balances AS") &&
      query.includes("expires_at > ?") &&
      query.includes("AND balance > 0") &&
      query.includes("ORDER BY issued_at ASC") &&
      !query.includes("LIMIT 1")
    ) {
      const userId = resolvedValues[0] as string
      const atTime = resolvedValues[2] as Date

      const activeLots = Object.values(TestLotSummaries).filter((lot) =>
        lot.user_id === userId &&
        lot.expires_at > atTime &&
        lot.current_balance > 0
      )

      return Effect.succeed(activeLots)
    }

    if (
      query.includes("WITH lot_balances AS") &&
      query.includes("WHERE expires_at <= ?") &&
      query.includes("AND balance > 0")
    ) {
      const userId = resolvedValues[0] as string
      const atTime = resolvedValues[1] as Date

      const expiredLots = Object.values(TestLotSummaries).filter((lot) =>
        lot.user_id === userId &&
        lot.expires_at <= atTime &&
        lot.current_balance > 0
      )

      return Effect.succeed(expiredLots)
    }

    if (
      query.includes("WITH lot_balances AS") &&
      query.includes("expires_at > ?") &&
      query.includes("AND balance > 0") &&
      query.includes("ORDER BY issued_at ASC") &&
      query.includes("LIMIT 1")
    ) {
      const userId = resolvedValues[0] as string
      const atTime = resolvedValues[1] as Date

      const oldestLot = Object.values(TestLotSummaries)
        .filter((lot) =>
          lot.user_id === userId &&
          lot.expires_at > atTime &&
          lot.current_balance > 0
        )
        .sort((a, b) => a.issued_at.getTime() - b.issued_at.getTime())[0] || null

      return Effect.succeed(oldestLot ? [oldestLot] : [])
    }

    if (
      query.includes("SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_credits") &&
      query.includes("SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_debits") &&
      query.includes("COALESCE(SUM(amount), 0) as current_balance")
    ) {
      const userId = resolvedValues[0] as string
      const userEntries = TestLedgerEntriesArray.filter((e) => e.user_id === userId)

      const totalCredits = userEntries.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0)
      const totalDebits = userEntries.filter((e) => e.amount < 0).reduce((sum, e) => sum + Math.abs(e.amount), 0)
      const currentBalance = userEntries.reduce((sum, e) => sum + e.amount, 0)

      const userLots = Object.values(TestLotSummaries).filter((lot) => lot.user_id === userId)
      const activeLots = userLots.filter((lot) => !lot.is_expired).length
      const expiredLots = userLots.filter((lot) => lot.is_expired).length

      return Effect.succeed([{
        total_credits: totalCredits,
        total_debits: totalDebits,
        current_balance: currentBalance,
        active_lots: activeLots,
        expired_lots: expiredLots
      }])
    }

    if (query.includes("INSERT INTO ledger_entries") && query.includes("VALUES")) {
      mockQueryContext.lastInsertValues = resolvedValues
      return Effect.succeed({ insertedRows: resolvedValues.length })
    }

    if (query.includes("INSERT INTO ledger_entries")) {
      mockQueryContext.lastInsertValues = resolvedValues
      return Effect.succeed({ insertId: 1 })
    }

    return Effect.succeed([])
  }
}

const createMockSql = () => {
  const sqlFunction = (strings: TemplateStringsArray, ...values: Array<unknown>) =>
    mockSqlClient.raw(strings, ...values)

  Object.assign(sqlFunction, {
    [Symbol.for("sql-template")]: true,
    raw: mockSqlClient.raw,
    in: (columnOrValues: string | Array<string>, values?: Array<string>) => {
      if (Array.isArray(columnOrValues)) {
        return createInFragment("reason", columnOrValues)
      }
      if (Array.isArray(values)) {
        return createInFragment(columnOrValues, values)
      }
      throw new Error("Invalid sql.in invocation in test harness")
    }
  })

  return sqlFunction as any
}

const MockDatabaseManagerLayer = Layer.succeed(DatabaseManager, {
  getConnection: (_merchantId: string) => Effect.succeed(createMockSql())
})

const MockMerchantContextLayer = Layer.succeed(MerchantContext, {
  merchantId: "test-merchant-id"
})

export const TestLayer = Layer.provide(
  Layer.provide(
    LedgerRepositoryService.Default,
    MockDatabaseManagerLayer
  ),
  MockMerchantContextLayer
)

export const withTestLayer = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(TestLayer))
