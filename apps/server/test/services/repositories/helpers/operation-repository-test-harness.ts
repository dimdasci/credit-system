import { MerchantContext } from "@credit-system/shared"
import { DatabaseManager } from "@server/services/external/DatabaseManager.js"
import { OperationRepository as OperationRepositoryService } from "@server/services/repositories/OperationRepository.js"
import type { OperationQueryOptions } from "@server/services/repositories/OperationRepository.js"
import { Effect, Layer } from "effect"
import { TestOperationsArray } from "../../../fixtures/operation-test-data.js"

export interface MockQueryContext {
  lastInsertValues: Array<unknown> | null
  lastUpdateValues: Array<unknown> | null
  lastQuery: string
  lastQueryValues: Array<unknown>
  lastOptions: OperationQueryOptions | null
}

const initialContext = (): MockQueryContext => ({
  lastInsertValues: null,
  lastUpdateValues: null,
  lastQuery: "",
  lastQueryValues: [],
  lastOptions: null
})

export const mockQueryContext: MockQueryContext = initialContext()

export const resetMockQueryContext = () => {
  Object.assign(mockQueryContext, initialContext())
}

const mockSqlClient = {
  [Symbol.for("sql-template")]: true,
  raw: (strings: TemplateStringsArray, ...values: Array<unknown>) => {
    const attachTemplate = <A, E = never, R = never>(effect: Effect.Effect<A, E, R>) => {
      if (typeof effect === "object" && effect !== null) {
        const decorated = effect as Effect.Effect<A, E, R> & {
          strings: TemplateStringsArray
          values: Array<unknown>
        }
        decorated.strings = strings
        decorated.values = values
        return decorated
      }
      return effect
    }
    let query = strings[0] ?? ""
    const resolvedValues: Array<unknown> = []

    for (let i = 0; i < values.length; i++) {
      const value = values[i]

      // Handle SQL fragments (similar to LedgerRepository test harness)
      if (value && typeof value === "object") {
        if ("strings" in (value as Record<string, unknown>)) {
          const fragmentStrings = (value as { strings?: ReadonlyArray<string> }).strings
          if (fragmentStrings) {
            // This is a template literal fragment - extract the SQL text
            const fragmentQuery = fragmentStrings.join("?")
            query += fragmentQuery
            // Extract any parameters from the fragment
            if ("values" in (value as Record<string, unknown>)) {
              const fragmentValues = (value as { values?: Array<unknown> }).values
              if (fragmentValues) {
                resolvedValues.push.apply(resolvedValues, fragmentValues)
              }
            }
            query += strings[i + 1] ?? ""
            continue
          }
        }
      }

      query += "?"
      resolvedValues.push(value)
      query += strings[i + 1] ?? ""
    }

    query = query.trim()
    mockQueryContext.lastQuery = query
    mockQueryContext.lastQueryValues = resolvedValues

    // Debug SQL queries (uncomment for debugging)
    // if (query.includes("SELECT * FROM operations") && (query.includes("WHERE user_id = ?") || query.includes("WHERE user_id = $1"))) {
    //   console.log(`SQL Query: ${query}`)
    //   console.log(`Values: [${resolvedValues.map((v) => typeof v === "string" ? `"${v}"` : JSON.stringify(v)).join(", ")}]`)
    //   console.log(`Query includes status filter: ${query.includes("AND status = ?") || query.includes("AND status = $")}`)
    //   console.log(`Query includes limit: ${query.includes("LIMIT ?") || query.includes("LIMIT $")}`)
    // }

    // Handle connection error simulation
    if (resolvedValues.some((val) => typeof val === "string" && val.includes("000000000000"))) {
      const effect = Effect.fail(new Error("ECONNREFUSED"))
      return attachTemplate(effect)
    }

    // INSERT operations
    if (query.includes("INSERT INTO operations")) {
      mockQueryContext.lastInsertValues = resolvedValues
      const effect = Effect.succeed({ insertId: 1 })
      return attachTemplate(effect)
    }

    // UPDATE operations
    if (
      query.includes("UPDATE operations") &&
      (query.includes("SET status = ?") || query.includes("SET status = 'expired'"))
    ) {
      const operationId = resolvedValues[resolvedValues.length - 1] as string
      if (operationId === "non-existent-id") {
        const effect = Effect.succeed({ affectedRows: 0, rowCount: 0 })
        return attachTemplate(effect)
      }
      mockQueryContext.lastUpdateValues = resolvedValues
      const effect = Effect.succeed({ affectedRows: 1, rowCount: 1 })
      return attachTemplate(effect)
    }

    // SELECT single operation by ID
    if (query.includes("SELECT * FROM operations") && query.includes("WHERE operation_id = ?")) {
      const operationId = resolvedValues[0] as string
      const operation = TestOperationsArray.find((op) => op.operation_id === operationId)
      const effect = Effect.succeed(operation ? [operation] : [])
      return attachTemplate(effect)
    }

    // SELECT open operation by user
    if (
      query.includes("SELECT * FROM operations") &&
      query.includes("WHERE user_id = ?") &&
      query.includes("AND status = 'open'")
    ) {
      const userId = resolvedValues[0] as string
      const openOperation = TestOperationsArray.find((op) => op.user_id === userId && op.status === "open")
      const effect = Effect.succeed(openOperation ? [openOperation] : [])
      return attachTemplate(effect)
    }

    // COUNT open operations by user
    if (
      query.includes("SELECT COUNT(*) as count FROM operations") &&
      query.includes("WHERE user_id = ?") &&
      query.includes("AND status = 'open'")
    ) {
      const userId = resolvedValues[0] as string
      const count = TestOperationsArray.filter((op) => op.user_id === userId && op.status === "open").length
      const effect = Effect.succeed([{ count }])
      return attachTemplate(effect)
    }

    // SELECT operations by user with filters - general case (supports both ? and $N placeholders)
    if (
      query.includes("SELECT * FROM operations") &&
      (query.includes("WHERE user_id = ?") || query.includes("WHERE user_id = $1")) &&
      !query.includes("AND status = 'open'")
    ) {
      const userId = resolvedValues[0] as string
      let operations = TestOperationsArray.filter((op) => op.user_id === userId)
      let paramIndex = 1

      // Apply status filter
      if (query.includes("AND status = ?") || query.includes("AND status = $")) {
        const status = resolvedValues[paramIndex] as string
        operations = operations.filter((op) => op.status === status)
        paramIndex++
      }

      // Apply operation type filter
      if (query.includes("AND operation_type_code = ?") || query.includes("AND operation_type_code = $")) {
        const operationType = resolvedValues[paramIndex] as string
        operations = operations.filter((op) => op.operation_type_code === operationType)
        paramIndex++
      }

      // Apply workflow filter
      if (query.includes("AND workflow_id = ?") || query.includes("AND workflow_id = $")) {
        const workflowId = resolvedValues[paramIndex] as string
        operations = operations.filter((op) => op.workflow_id === workflowId)
        paramIndex++
      }

      // Apply date filters
      if (query.includes("AND opened_at >= ?") || query.includes("AND opened_at >= $")) {
        const fromDate = resolvedValues[paramIndex] as Date
        operations = operations.filter((op) => new Date(op.opened_at) >= fromDate)
        paramIndex++
      }

      if (query.includes("AND opened_at <= ?") || query.includes("AND opened_at <= $")) {
        const toDate = resolvedValues[paramIndex] as Date
        operations = operations.filter((op) => new Date(op.opened_at) <= toDate)
        paramIndex++
      }

      // Apply limit
      if (query.includes("LIMIT ?") || query.includes("LIMIT $")) {
        const limit = resolvedValues[paramIndex] as number
        operations = operations.slice(0, limit)
        paramIndex++
      }

      // Apply offset
      if (query.includes("OFFSET ?") || query.includes("OFFSET $")) {
        const offset = resolvedValues[paramIndex] as number
        operations = operations.slice(offset)
      }

      const effect = Effect.succeed(operations)
      return attachTemplate(effect)
    }

    // SELECT operations by workflow
    if (
      query.includes("SELECT * FROM operations") &&
      query.includes("WHERE workflow_id = ?")
    ) {
      const workflowId = resolvedValues[0] as string
      const operations = TestOperationsArray.filter((op) => op.workflow_id === workflowId)
      const effect = Effect.succeed(operations)
      return attachTemplate(effect)
    }

    // SELECT expired operations
    if (
      query.includes("SELECT * FROM operations") &&
      query.includes("WHERE status = 'open'") &&
      query.includes("AND expires_at < ?")
    ) {
      const cutoffDate = resolvedValues[0] as Date
      const expiredOps = TestOperationsArray.filter((op) =>
        op.status === "open" && new Date(op.expires_at) < cutoffDate
      )
      const effect = Effect.succeed(expiredOps)
      return attachTemplate(effect)
    }

    // DELETE expired operations
    if (
      query.includes("DELETE FROM operations") &&
      query.includes("WHERE status IN ('expired', 'completed')") &&
      query.includes("AND closed_at < ?")
    ) {
      const beforeDate = resolvedValues[0] as Date
      const eligibleOps = TestOperationsArray.filter((op) =>
        ["expired", "completed"].includes(op.status) &&
        op.closed_at && new Date(op.closed_at) < beforeDate
      )
      const effect = Effect.succeed({ affectedRows: eligibleOps.length, rowCount: eligibleOps.length })
      return attachTemplate(effect)
    }

    // COUNT active operations
    if (
      query.includes("SELECT COUNT(*) as count FROM operations") &&
      query.includes("WHERE status = 'open'")
    ) {
      const count = TestOperationsArray.filter((op) => op.status === "open").length
      const effect = Effect.succeed([{ count }])
      return attachTemplate(effect)
    }

    // Operation stats
    if (
      query.includes("COUNT(*) as total_operations") &&
      query.includes("COUNT(CASE WHEN status = 'completed'") &&
      query.includes("AVG(EXTRACT(EPOCH FROM")
    ) {
      const fromDate = resolvedValues[0] as Date
      const toDate = resolvedValues[1] as Date

      const opsInRange = TestOperationsArray.filter((op) => {
        const openedAt = new Date(op.opened_at)
        return openedAt >= fromDate && openedAt <= toDate
      })

      const totalOps = opsInRange.length
      const completedOps = opsInRange.filter((op) => op.status === "completed").length
      const expiredOps = opsInRange.filter((op) => op.status === "expired").length
      // Calculate average duration for completed operations
      const completedWithDuration = opsInRange.filter((op) => op.status === "completed" && op.closed_at)
      const avgDurationMinutes = completedWithDuration.length > 0
        ? completedWithDuration.reduce((sum, op) => {
          const duration = (new Date(op.closed_at!).getTime() - new Date(op.opened_at).getTime()) / (1000 * 60)
          return sum + duration
        }, 0) / completedWithDuration.length
        : 0

      const effect = Effect.succeed([{
        total_operations: totalOps,
        completed_operations: completedOps,
        expired_operations: expiredOps,
        avg_duration_minutes: avgDurationMinutes
      }])
      return attachTemplate(effect)
    }

    const effect = Effect.succeed([])
    return attachTemplate(effect)
  }
}

const createMockSql = () => {
  const sqlFunction = (strings: TemplateStringsArray, ...values: Array<unknown>) =>
    mockSqlClient.raw(strings, ...values)

  Object.assign(sqlFunction, {
    [Symbol.for("sql-template")]: true,
    raw: (queryText: string, params: Array<unknown>) => {
      // Handle sql.raw calls with direct query text and parameters
      mockQueryContext.lastQuery = queryText
      mockQueryContext.lastQueryValues = params

      // Debug SQL queries (uncomment for debugging)
      // if (queryText.includes("SELECT * FROM operations") && queryText.includes("WHERE user_id = ?")) {
      //   console.log(`SQL Query: ${queryText}`)
      //   console.log(`Values: [${params.map(v => typeof v === 'string' ? `"${v}"` : v).join(', ')}]`)
      // }

      // Handle connection error simulation
      if (params.some((val) => typeof val === "string" && val.includes("000000000000"))) {
        return Effect.fail(new Error("ECONNREFUSED"))
      }

      // Route to appropriate handlers based on query content
      return mockSqlClient.raw([queryText] as any, ...params)
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
    OperationRepositoryService.Default,
    MockDatabaseManagerLayer
  ),
  MockMerchantContextLayer
)

export const withTestLayer = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(TestLayer))
