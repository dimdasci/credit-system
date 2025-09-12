import { Effect, Context } from "effect"
import { Receipt } from "../entities/Receipt.js"
import { DomainError } from "../../shared/errors/DomainErrors.js"

// Query options for receipt history
export interface ReceiptQueryOptions {
  limit?: number
  offset?: number
  fromDate?: Date
  toDate?: Date
  sortBy?: "issued_at" | "receipt_number"
  sortOrder?: "asc" | "desc"
}

// Repository interface for receipt document management
export interface ReceiptRepository {
  // Core receipt operations
  createReceipt: (receipt: Receipt) => Effect.Effect<void, DomainError>
  getReceiptById: (receipt_id: string) => Effect.Effect<Receipt | null, DomainError>
  getReceiptByNumber: (receipt_number: string) => Effect.Effect<Receipt | null, DomainError>
  
  // Lot-based queries (one receipt per purchase lot)
  getReceiptByLot: (lot_id: string) => Effect.Effect<Receipt | null, DomainError>
  hasReceiptForLot: (lot_id: string) => Effect.Effect<boolean, DomainError>
  
  // User receipt history
  getUserReceipts: (user_id: string, options?: ReceiptQueryOptions) => Effect.Effect<Receipt[], DomainError>
  getUserReceiptCount: (user_id: string) => Effect.Effect<number, DomainError>
  
  // Receipt numbering (merchant-scoped sequences)
  getNextReceiptNumber: (merchant_id: string, year?: number) => Effect.Effect<string, DomainError>
  getReceiptsByNumberRange: (start_number: string, end_number: string) => Effect.Effect<Receipt[], DomainError>
  
  // Tax and compliance
  getReceiptsForPeriod: (fromDate: Date, toDate: Date) => Effect.Effect<Receipt[], DomainError>
  getReceiptTotalsForPeriod: (fromDate: Date, toDate: Date) => Effect.Effect<{
    total_receipts: number
    total_amount: number
    currencies: Array<{ currency: string; total: number }>
    tax_breakdown: Array<{ tax_type: string; total: number }>
  }, DomainError>
  
  // Data integrity
  validateReceiptIntegrity: (receipt_id: string) => Effect.Effect<{
    valid: boolean
    lot_exists: boolean
    purchase_snapshot_complete: boolean
    merchant_config_complete: boolean
  }, DomainError>
}

// Context tag for dependency injection
export const ReceiptRepository = Context.GenericTag<ReceiptRepository>("ReceiptRepository")