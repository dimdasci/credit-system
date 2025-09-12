import type { Effect } from "effect"
import { Context } from "effect"
import type { DomainError } from "../../shared/errors/DomainErrors.js"
import type { Operation } from "../entities/Operation.js"

// Query options for operation history
export interface OperationQueryOptions {
  limit?: number
  offset?: number
  status?: "open" | "completed" | "expired" | "cancelled"
  operation_type_code?: string
  workflow_id?: string
  fromDate?: Date
  toDate?: Date
}

// Repository interface for operation lifecycle management
export interface OperationRepository {
  // Core lifecycle operations
  createOperation: (operation: Operation) => Effect.Effect<void, DomainError>
  getOperationById: (operation_id: string) => Effect.Effect<Operation | null, DomainError>
  updateOperationStatus: (
    operation_id: string,
    status: "completed" | "expired" | "cancelled",
    closed_at?: Date
  ) => Effect.Effect<void, DomainError>

  // Concurrency control
  getOpenOperation: (user_id: string) => Effect.Effect<Operation | null, DomainError>
  hasOpenOperation: (user_id: string) => Effect.Effect<boolean, DomainError>

  // Operation queries
  getOperationsByUser: (
    user_id: string,
    options?: OperationQueryOptions
  ) => Effect.Effect<Array<Operation>, DomainError>
  getOperationsByWorkflow: (workflow_id: string) => Effect.Effect<Array<Operation>, DomainError>

  // Expiry management
  getExpiredOperations: (before_date?: Date) => Effect.Effect<Array<Operation>, DomainError>
  expireOperation: (operation_id: string, expired_at: Date) => Effect.Effect<void, DomainError>
  cleanupExpiredOperations: (before_date: Date) => Effect.Effect<number, DomainError> // Returns count of cleaned up operations

  // Monitoring and analytics
  getActiveOperationsCount: () => Effect.Effect<number, DomainError>
  getOperationStats: (fromDate: Date, toDate: Date) => Effect.Effect<{
    total_operations: number
    completed_operations: number
    expired_operations: number
    cancelled_operations: number
    avg_duration_minutes: number
  }, DomainError>
}

// Context tag for dependency injection
export const OperationRepository = Context.GenericTag<OperationRepository>("OperationRepository")
