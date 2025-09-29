import { MerchantContext } from "@credit-system/shared"
import * as SqlSchema from "@effect/sql/SqlSchema"
import { Operation } from "@server/domain/operations/Operation.js"
import { InvalidRequest, ServiceUnavailable } from "@server/domain/shared/DomainErrors.js"
import { DatabaseManager } from "@server/services/external/DatabaseManager.js"
import { Effect, Schema } from "effect"

// Query options for operation history
export interface OperationQueryOptions {
  limit?: number
  offset?: number
  status?: "open" | "completed" | "expired"
  operation_type_code?: string
  workflow_id?: string
  fromDate?: Date
  toDate?: Date
}

// Database error mapping utility
const mapDatabaseError = (error: unknown): ServiceUnavailable => {
  if (error && typeof error === "object") {
    const errorObj = error as { code?: string; message?: string; name?: string }

    // PostgreSQL connection errors
    if (errorObj.code === "ECONNREFUSED" || errorObj.code === "ENOTFOUND") {
      return new ServiceUnavailable({
        service: "OperationRepository",
        reason: "database_connection_failure",
        retry_after_seconds: 5
      })
    }

    // PostgreSQL timeout errors
    if (errorObj.code === "ETIMEOUT" || errorObj.message?.includes("timeout")) {
      return new ServiceUnavailable({
        service: "OperationRepository",
        reason: "transaction_timeout",
        retry_after_seconds: 10
      })
    }

    // PostgreSQL unique constraint violations (concurrent updates)
    if (errorObj.code === "23505" || errorObj.code === "40001") {
      return new ServiceUnavailable({
        service: "OperationRepository",
        reason: "concurrent_update_conflict",
        retry_after_seconds: 2
      })
    }

    // Resource exhaustion (connection pool, memory)
    if (errorObj.code === "53300" || errorObj.code === "53200") {
      return new ServiceUnavailable({
        service: "OperationRepository",
        reason: "resource_exhaustion",
        retry_after_seconds: 15
      })
    }
  }

  // Default fallback for unknown database errors
  return new ServiceUnavailable({
    service: "OperationRepository",
    reason: "database_connection_failure",
    retry_after_seconds: 5
  })
}

export class OperationRepository extends Effect.Service<OperationRepository>()(
  "OperationRepository",
  {
    effect: Effect.gen(function*() {
      const db = yield* DatabaseManager
      const merchantContext = yield* MerchantContext

      // Core operation mutations
      const _createOperation = SqlSchema.void({
        Request: Operation,
        execute: (operation) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)

            return yield* sql`
              INSERT INTO operations (
                operation_id, user_id, operation_type_code, workflow_id,
                captured_rate, status, opened_at, expires_at, closed_at
              ) VALUES (
                ${operation.operation_id}, ${operation.user_id},
                ${operation.operation_type_code}, ${operation.workflow_id},
                ${operation.captured_rate}, ${operation.status},
                ${operation.opened_at}, ${operation.expires_at}, ${operation.closed_at}
              )
            `
          })
      })

      return {
        // Core lifecycle operations
        createOperation: (operation: Operation) => _createOperation(operation).pipe(Effect.mapError(mapDatabaseError)),

        getOperationById: (
          operation_id: string
        ): Effect.Effect<Operation | null, InvalidRequest | ServiceUnavailable> =>
          Effect.gen(function*() {
            // Validate input parameters
            if (!operation_id || operation_id.trim().length === 0) {
              return yield* Effect.fail(
                new InvalidRequest({
                  field: "operation_id",
                  reason: "invalid_parameters",
                  details: "Operation ID cannot be empty"
                })
              )
            }

            const sql = yield* db.getConnection(merchantContext.merchantId)
              .pipe(Effect.mapError(mapDatabaseError))

            const result = yield* sql<Operation.Encoded>`
              SELECT * FROM operations
              WHERE operation_id = ${operation_id}
              LIMIT 1
            `.pipe(Effect.mapError(mapDatabaseError))

            if (result.length === 0) {
              return null
            }

            const decoded = yield* Schema.decodeUnknown(Operation)(result[0])
              .pipe(Effect.mapError(() =>
                new ServiceUnavailable({
                  service: "OperationRepository",
                  reason: "data_corruption",
                  retry_after_seconds: 5
                })
              ))

            return decoded
          }),

        updateOperationStatus: (
          operation_id: string,
          status: "completed" | "expired",
          closed_at?: Date
        ): Effect.Effect<void, InvalidRequest | ServiceUnavailable> =>
          Effect.gen(function*() {
            // Validate input parameters
            if (!operation_id || operation_id.trim().length === 0) {
              return yield* Effect.fail(
                new InvalidRequest({
                  field: "operation_id",
                  reason: "invalid_parameters",
                  details: "Operation ID cannot be empty"
                })
              )
            }

            const sql = yield* db.getConnection(merchantContext.merchantId)
              .pipe(Effect.mapError(mapDatabaseError))

            const closedAtValue = closed_at ?? new Date()

            const result = yield* sql`
              UPDATE operations
              SET status = ${status}, closed_at = ${closedAtValue}
              WHERE operation_id = ${operation_id}
            `.pipe(Effect.mapError(mapDatabaseError))

            // Check if any rows were affected
            const rowsAffected = typeof result === "object" && result !== null
              ? "rowCount" in result
                ? (result.rowCount as number)
                : "affectedRows" in result
                ? (result.affectedRows as number)
                : undefined
              : undefined

            if (rowsAffected === 0) {
              return yield* Effect.fail(
                new InvalidRequest({
                  field: "operation_id",
                  reason: "not_found",
                  details: "Operation not found"
                })
              )
            }
          }),

        // Concurrency control
        getOpenOperation: (user_id: string): Effect.Effect<Operation | null, InvalidRequest | ServiceUnavailable> =>
          Effect.gen(function*() {
            // Validate input parameters
            if (!user_id || user_id.trim().length === 0) {
              return yield* Effect.fail(
                new InvalidRequest({
                  field: "user_id",
                  reason: "invalid_parameters",
                  details: "User ID cannot be empty"
                })
              )
            }

            const sql = yield* db.getConnection(merchantContext.merchantId)
              .pipe(Effect.mapError(mapDatabaseError))

            const result = yield* sql<Operation.Encoded>`
              SELECT * FROM operations
              WHERE user_id = ${user_id}
                AND status = 'open'
              ORDER BY opened_at DESC
              LIMIT 1
            `.pipe(Effect.mapError(mapDatabaseError))

            if (result.length === 0) {
              return null
            }

            const decoded = yield* Schema.decodeUnknown(Operation)(result[0])
              .pipe(Effect.mapError(() =>
                new ServiceUnavailable({
                  service: "OperationRepository",
                  reason: "data_corruption",
                  retry_after_seconds: 5
                })
              ))

            return decoded
          }),

        hasOpenOperation: (user_id: string): Effect.Effect<boolean, InvalidRequest | ServiceUnavailable> =>
          Effect.gen(function*() {
            // Validate input parameters
            if (!user_id || user_id.trim().length === 0) {
              return yield* Effect.fail(
                new InvalidRequest({
                  field: "user_id",
                  reason: "invalid_parameters",
                  details: "User ID cannot be empty"
                })
              )
            }

            const sql = yield* db.getConnection(merchantContext.merchantId)
              .pipe(Effect.mapError(mapDatabaseError))

            const result = yield* sql<{ count: number }>`
              SELECT COUNT(*) as count FROM operations
              WHERE user_id = ${user_id}
                AND status = 'open'
            `.pipe(Effect.mapError(mapDatabaseError))

            return (result[0]?.count || 0) > 0
          }),

        // Operation queries
        getOperationsByUser: (
          user_id: string,
          options?: OperationQueryOptions
        ): Effect.Effect<Array<Operation>, InvalidRequest | ServiceUnavailable> =>
          Effect.gen(function*() {
            // Validate input parameters
            if (!user_id || user_id.trim().length === 0) {
              return yield* Effect.fail(
                new InvalidRequest({
                  field: "user_id",
                  reason: "invalid_parameters",
                  details: "User ID cannot be empty"
                })
              )
            }

            const sql = yield* db.getConnection(merchantContext.merchantId)
              .pipe(Effect.mapError(mapDatabaseError))

            const opts = options || {}

            const statusFilter = opts.status ? sql`AND status = ${opts.status}` : sql``
            const typeFilter = opts.operation_type_code
              ? sql`AND operation_type_code = ${opts.operation_type_code}`
              : sql``
            const workflowFilter = opts.workflow_id ? sql`AND workflow_id = ${opts.workflow_id}` : sql``
            const fromFilter = opts.fromDate ? sql`AND opened_at >= ${opts.fromDate}` : sql``
            const toFilter = opts.toDate ? sql`AND opened_at <= ${opts.toDate}` : sql``
            const limitClause = typeof opts.limit === "number" ? sql`LIMIT ${opts.limit}` : sql``
            const offsetClause = typeof opts.offset === "number" ? sql`OFFSET ${opts.offset}` : sql``

            const result = yield* sql<Operation.Encoded>`
              SELECT * FROM operations
              WHERE user_id = ${user_id}
              ${statusFilter}
              ${typeFilter}
              ${workflowFilter}
              ${fromFilter}
              ${toFilter}
              ORDER BY opened_at DESC
              ${limitClause}
              ${offsetClause}
            `.pipe(Effect.mapError(mapDatabaseError))

            const operations = yield* Effect.forEach(result, (op) =>
              Schema.decodeUnknown(Operation)(op).pipe(
                Effect.mapError(() =>
                  new ServiceUnavailable({
                    service: "OperationRepository",
                    reason: "data_corruption",
                    retry_after_seconds: 5
                  })
                )
              ))

            return operations
          }),

        getOperationsByWorkflow: (
          workflow_id: string
        ): Effect.Effect<Array<Operation>, InvalidRequest | ServiceUnavailable> =>
          Effect.gen(function*() {
            // Validate input parameters
            if (!workflow_id || workflow_id.trim().length === 0) {
              return yield* Effect.fail(
                new InvalidRequest({
                  field: "workflow_id",
                  reason: "invalid_parameters",
                  details: "Workflow ID cannot be empty"
                })
              )
            }

            const sql = yield* db.getConnection(merchantContext.merchantId)
              .pipe(Effect.mapError(mapDatabaseError))

            const result = yield* sql<Operation.Encoded>`
              SELECT * FROM operations
              WHERE workflow_id = ${workflow_id}
              ORDER BY opened_at DESC
            `.pipe(Effect.mapError(mapDatabaseError))

            const operations = yield* Effect.forEach(result, (op) =>
              Schema.decodeUnknown(Operation)(op).pipe(
                Effect.mapError(() =>
                  new ServiceUnavailable({
                    service: "OperationRepository",
                    reason: "data_corruption",
                    retry_after_seconds: 5
                  })
                )
              ))

            return operations
          }),

        // Expiry management
        getExpiredOperations: (before_date?: Date): Effect.Effect<Array<Operation>, ServiceUnavailable> =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
              .pipe(Effect.mapError(mapDatabaseError))

            const cutoffDate = before_date ?? new Date()

            const result = yield* sql<Operation.Encoded>`
              SELECT * FROM operations
              WHERE status = 'open'
                AND expires_at < ${cutoffDate}
              ORDER BY expires_at ASC
            `.pipe(Effect.mapError(mapDatabaseError))

            const operations = yield* Effect.forEach(result, (op) =>
              Schema.decodeUnknown(Operation)(op).pipe(
                Effect.mapError(() =>
                  new ServiceUnavailable({
                    service: "OperationRepository",
                    reason: "data_corruption",
                    retry_after_seconds: 5
                  })
                )
              ))

            return operations
          }),

        expireOperation: (
          operation_id: string,
          expired_at: Date
        ): Effect.Effect<void, InvalidRequest | ServiceUnavailable> =>
          Effect.gen(function*() {
            // Validate input parameters
            if (!operation_id || operation_id.trim().length === 0) {
              return yield* Effect.fail(
                new InvalidRequest({
                  field: "operation_id",
                  reason: "invalid_parameters",
                  details: "Operation ID cannot be empty"
                })
              )
            }

            const sql = yield* db.getConnection(merchantContext.merchantId)
              .pipe(Effect.mapError(mapDatabaseError))

            yield* sql`
              UPDATE operations
              SET status = 'expired', closed_at = ${expired_at}
              WHERE operation_id = ${operation_id}
            `.pipe(Effect.mapError(mapDatabaseError))
          }),

        cleanupExpiredOperations: (before_date: Date): Effect.Effect<number, ServiceUnavailable> =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
              .pipe(Effect.mapError(mapDatabaseError))

            const result = yield* sql`
              DELETE FROM operations
              WHERE status IN ('expired', 'completed')
                AND closed_at < ${before_date}
            `.pipe(Effect.mapError(mapDatabaseError))

            // Return the number of affected rows
            const rowsAffected = typeof result === "object" && result !== null
              ? "rowCount" in result
                ? (result.rowCount as number)
                : "affectedRows" in result
                ? (result.affectedRows as number)
                : 0
              : 0

            return rowsAffected
          }),

        // Monitoring and analytics
        getActiveOperationsCount: (): Effect.Effect<number, ServiceUnavailable> =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
              .pipe(Effect.mapError(mapDatabaseError))

            const result = yield* sql<{ count: number }>`
              SELECT COUNT(*) as count FROM operations
              WHERE status = 'open'
            `.pipe(Effect.mapError(mapDatabaseError))

            return result[0]?.count || 0
          }),

        getOperationStats: (fromDate: Date, toDate: Date): Effect.Effect<{
          total_operations: number
          completed_operations: number
          expired_operations: number
          avg_duration_minutes: number
        }, InvalidRequest | ServiceUnavailable> =>
          Effect.gen(function*() {
            // Validate input parameters
            if (fromDate >= toDate) {
              return yield* Effect.fail(
                new InvalidRequest({
                  field: "date_range",
                  reason: "invalid_parameters",
                  details: "fromDate must be before toDate"
                })
              )
            }

            const sql = yield* db.getConnection(merchantContext.merchantId)
              .pipe(Effect.mapError(mapDatabaseError))

            const result = yield* sql<{
              total_operations: number
              completed_operations: number
              expired_operations: number
              avg_duration_minutes: number
            }>`
              SELECT
                COUNT(*) as total_operations,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_operations,
                COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_operations,
                COALESCE(
                  AVG(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 60)
                  FILTER (WHERE status = 'completed' AND closed_at IS NOT NULL),
                  0
                ) as avg_duration_minutes
              FROM operations
              WHERE opened_at >= ${fromDate}
                AND opened_at <= ${toDate}
            `.pipe(Effect.mapError(mapDatabaseError))

            return result[0] || {
              total_operations: 0,
              completed_operations: 0,
              expired_operations: 0,
              avg_duration_minutes: 0
            }
          })
      }
    })
  }
) {}
