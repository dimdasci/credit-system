import { Operation } from "@server/domain/operations/Operation.js"
import { InvalidRequest, ServiceUnavailable } from "@server/domain/shared/DomainErrors.js"
import { OperationRepository } from "@server/services/repositories/OperationRepository.js"
import { Effect, Schema } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { TestOperations, TestUsers } from "../../fixtures/operation-test-data.js"
import { mockQueryContext, resetMockQueryContext, TestLayer } from "./helpers/operation-repository-test-harness.js"

describe("OperationRepository", () => {
  beforeEach(() => resetMockQueryContext())

  describe("createOperation", () => {
    it("creates a new operation in the database", () =>
      Effect.gen(function*() {
        const repo = yield* OperationRepository
        const operation = Schema.decodeSync(Operation)(TestOperations.OPEN_OPERATION_1)

        yield* repo.createOperation(operation)

        const insertValues = mockQueryContext.lastInsertValues
        expect(insertValues).not.toBeNull()
        const values = insertValues ?? []
        expect(values[0]).toBe(operation.operation_id)
        expect(values[1]).toBe(operation.user_id)
        expect(values[2]).toBe(operation.operation_type_code)
        expect(values[3]).toBe("workflow-123")
        expect(values[4]).toBe(operation.captured_rate)
        expect(values[5]).toBe(operation.status)
        expect(new Date(values[6] as string)).toBeInstanceOf(Date)
        expect(new Date(values[7] as string)).toBeInstanceOf(Date)
        expect(values[8]).toBeNull() // closed_at
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("fails with ServiceUnavailable on database connection error", () =>
      Effect.gen(function*() {
        const repo = yield* OperationRepository
        const operation = Schema.decodeSync(Operation)({
          ...TestOperations.OPEN_OPERATION_1,
          operation_id: "11111111-2222-3333-4444-000000000000"
        })

        const result = yield* repo.createOperation(operation).pipe(Effect.flip)

        expect(result).toBeInstanceOf(ServiceUnavailable)
        expect(result.service).toBe("OperationRepository")
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getOperationById", () => {
    it("returns operation when found", () =>
      Effect.gen(function*() {
        const repo = yield* OperationRepository

        const operation = yield* repo.getOperationById(TestOperations.OPEN_OPERATION_1.operation_id)

        expect(operation).not.toBeNull()
        expect(operation!.operation_id).toBe(TestOperations.OPEN_OPERATION_1.operation_id)
        expect(operation!.user_id).toBe(TestOperations.OPEN_OPERATION_1.user_id)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("returns null when operation not found", () =>
      Effect.gen(function*() {
        const repo = yield* OperationRepository

        const operation = yield* repo.getOperationById("non-existent-id")

        expect(operation).toBeNull()
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("updateOperationStatus", () => {
    it("updates operation status to completed with closed_at timestamp", () =>
      Effect.gen(function*() {
        const repo = yield* OperationRepository
        const closedAt = new Date("2025-03-10T15:00:00Z")

        yield* repo.updateOperationStatus(
          TestOperations.OPEN_OPERATION_1.operation_id,
          "completed",
          closedAt
        )

        const updateValues = mockQueryContext.lastUpdateValues
        expect(updateValues).not.toBeNull()
        const values = updateValues ?? []
        expect(values[0]).toBe("completed")
        expect(values[1]).toBe(closedAt)
        expect(values[2]).toBe(TestOperations.OPEN_OPERATION_1.operation_id)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("fails with InvalidRequest when trying to update non-existent operation", () =>
      Effect.gen(function*() {
        const repo = yield* OperationRepository

        const result = yield* repo.updateOperationStatus(
          "non-existent-id",
          "completed"
        ).pipe(Effect.flip)

        expect(result).toBeInstanceOf(InvalidRequest)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("concurrency control", () => {
    describe("getOpenOperation", () => {
      it("returns the open operation for a user", () =>
        Effect.gen(function*() {
          const repo = yield* OperationRepository

          const operation = yield* repo.getOpenOperation(TestUsers.USER_1)

          expect(operation).not.toBeNull()
          expect(operation!.user_id).toBe(TestUsers.USER_1)
          expect(operation!.status).toBe("open")
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("returns null when user has no open operation", () =>
        Effect.gen(function*() {
          const repo = yield* OperationRepository

          const operation = yield* repo.getOpenOperation(TestUsers.USER_2)

          expect(operation).toBeNull()
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })

    describe("hasOpenOperation", () => {
      it("returns true when user has an open operation", () =>
        Effect.gen(function*() {
          const repo = yield* OperationRepository

          const hasOpen = yield* repo.hasOpenOperation(TestUsers.USER_1)

          expect(hasOpen).toBe(true)
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("returns false when user has no open operation", () =>
        Effect.gen(function*() {
          const repo = yield* OperationRepository

          const hasOpen = yield* repo.hasOpenOperation(TestUsers.USER_2)

          expect(hasOpen).toBe(false)
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })
  })

  describe("operation queries", () => {
    describe("getOperationsByUser", () => {
      it("returns all operations for a user", () =>
        Effect.gen(function*() {
          const repo = yield* OperationRepository

          const operations = yield* repo.getOperationsByUser(TestUsers.USER_1)

          expect(operations.length).toBeGreaterThan(0)
          operations.forEach((op) => {
            expect(op.user_id).toBe(TestUsers.USER_1)
          })
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("filters operations by status", () =>
        Effect.gen(function*() {
          const repo = yield* OperationRepository

          const operations = yield* repo.getOperationsByUser(TestUsers.USER_1, {
            status: "completed"
          })

          expect(operations.length).toBeGreaterThan(0)
          operations.forEach((op) => {
            expect(op.status).toBe("completed")
          })
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("applies limit and offset", () =>
        Effect.gen(function*() {
          const repo = yield* OperationRepository

          const operations = yield* repo.getOperationsByUser(TestUsers.USER_1, {
            limit: 1,
            offset: 0
          })

          expect(operations.length).toBe(1)
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })

    describe("getOperationsByWorkflow", () => {
      it("returns operations for a specific workflow", () =>
        Effect.gen(function*() {
          const repo = yield* OperationRepository

          const operations = yield* repo.getOperationsByWorkflow("workflow-123")

          operations.forEach((op) => {
            expect(op.workflow_id._tag).toBe("Some")
            if (op.workflow_id._tag === "Some") {
              expect(op.workflow_id.value).toBe("workflow-123")
            }
          })
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })
  })

  describe("expiry management", () => {
    describe("getExpiredOperations", () => {
      it("returns operations that are expired", () =>
        Effect.gen(function*() {
          const repo = yield* OperationRepository
          const cutoffDate = new Date("2025-03-15T00:00:00Z")

          const expiredOps = yield* repo.getExpiredOperations(cutoffDate)

          expiredOps.forEach((op) => {
            expect(op.expires_at.getTime()).toBeLessThan(cutoffDate.getTime())
            expect(op.status).toBe("open")
          })
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })

    describe("expireOperation", () => {
      it("marks an operation as expired with timestamp", () =>
        Effect.gen(function*() {
          const repo = yield* OperationRepository
          const expiredAt = new Date("2025-03-15T10:00:00Z")

          yield* repo.expireOperation(TestOperations.OPEN_OPERATION_1.operation_id, expiredAt)

          const updateValues = mockQueryContext.lastUpdateValues
          expect(updateValues).not.toBeNull()
          const values = updateValues ?? []
          expect(values[0]).toBe(expiredAt) // timestamp comes first
          expect(values[1]).toBe(TestOperations.OPEN_OPERATION_1.operation_id) // then operation_id
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })

    describe("cleanupExpiredOperations", () => {
      it("removes expired operations and returns count", () =>
        Effect.gen(function*() {
          const repo = yield* OperationRepository
          const beforeDate = new Date("2025-03-15T00:00:00Z")

          const cleanedCount = yield* repo.cleanupExpiredOperations(beforeDate)

          expect(typeof cleanedCount).toBe("number")
          expect(cleanedCount).toBeGreaterThanOrEqual(0)
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })
  })

  describe("monitoring and analytics", () => {
    describe("getActiveOperationsCount", () => {
      it("returns count of active operations", () =>
        Effect.gen(function*() {
          const repo = yield* OperationRepository

          const count = yield* repo.getActiveOperationsCount()

          expect(typeof count).toBe("number")
          expect(count).toBeGreaterThanOrEqual(0)
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })

    describe("getOperationStats", () => {
      it("returns operation statistics for date range", () =>
        Effect.gen(function*() {
          const repo = yield* OperationRepository
          const fromDate = new Date("2025-03-01T00:00:00Z")
          const toDate = new Date("2025-03-31T23:59:59Z")

          const stats = yield* repo.getOperationStats(fromDate, toDate)

          expect(stats.total_operations).toBeGreaterThanOrEqual(0)
          expect(stats.completed_operations).toBeGreaterThanOrEqual(0)
          expect(stats.expired_operations).toBeGreaterThanOrEqual(0)
          expect(stats.avg_duration_minutes).toBeGreaterThanOrEqual(0)
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })
  })
})
