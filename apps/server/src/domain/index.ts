// Shared value objects
export * from "./shared/index.js"

// Domain errors
export * from "./shared/index.js"

// Credit ledger aggregate
export * from "./credit-ledger/index.js"

// Operations aggregate
export * from "./operations/index.js"

// Products aggregate
export * from "./products/index.js"

// Receipts aggregate
export * from "./receipts/index.js"

// Services (repositories moved to services layer)
export { ProductRepository } from "../services/repositories/ProductRepository.js"
