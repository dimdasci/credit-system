import type { Operation } from "@server/domain/operations/Operation.js"

export const TestUsers = {
  USER_1: "user-1-has-open-operation",
  USER_2: "user-2-no-open-operation",
  USER_3: "user-3-completed-operations"
} as const

export const TestOperations = {
  OPEN_OPERATION_1: {
    operation_id: "11111111-2222-3333-4444-555555555555",
    user_id: TestUsers.USER_1,
    operation_type_code: "api_usage",
    workflow_id: "workflow-123",
    captured_rate: 0.025,
    status: "open" as const,
    opened_at: "2025-03-10T10:00:00Z",
    expires_at: "2025-03-10T11:00:00Z",
    closed_at: null
  },
  COMPLETED_OPERATION_1: {
    operation_id: "22222222-3333-4444-5555-666666666666",
    user_id: TestUsers.USER_1, // Change to USER_1 for filtering test
    operation_type_code: "api_usage",
    workflow_id: "workflow-456",
    captured_rate: 0.025,
    status: "completed" as const,
    opened_at: "2025-03-09T14:00:00Z",
    expires_at: "2025-03-09T15:00:00Z",
    closed_at: "2025-03-09T14:30:00Z"
  },
  EXPIRED_OPERATION_1: {
    operation_id: "33333333-4444-5555-6666-777777777777",
    user_id: TestUsers.USER_3,
    operation_type_code: "file_processing",
    workflow_id: null,
    captured_rate: 0.1,
    status: "open" as const,
    opened_at: "2025-03-01T09:00:00Z",
    expires_at: "2025-03-01T10:00:00Z", // Already expired
    closed_at: null
  },
  CANCELLED_OPERATION_1: {
    operation_id: "44444444-5555-6666-7777-888888888888",
    user_id: TestUsers.USER_3,
    operation_type_code: "api_usage",
    workflow_id: "workflow-789",
    captured_rate: 0.025,
    status: "cancelled" as const,
    opened_at: "2025-03-08T16:00:00Z",
    expires_at: "2025-03-08T17:00:00Z",
    closed_at: "2025-03-08T16:15:00Z"
  }
} as const

export const TestOperationsArray: Array<Operation.Encoded> = [
  TestOperations.OPEN_OPERATION_1,
  TestOperations.COMPLETED_OPERATION_1,
  TestOperations.EXPIRED_OPERATION_1,
  TestOperations.CANCELLED_OPERATION_1
]
