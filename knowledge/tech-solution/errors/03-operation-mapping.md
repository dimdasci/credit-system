# Step 3: Error-to-Operation Mapping

## Purpose
Map each error to the specific domain commands and business processes that trigger them, showing exactly where in our system each error can occur.

## Domain Command Categories
- **User Events** (Upstream App → Ledger): `Purchase.Settled`, `Operation.Open`, `Operation.RecordAndClose`, `Grant.Apply` (welcome)
- **Admin Events** (Control Panel → Ledger): `Grant.Apply` (promo), `CreditAdjustment.Apply`, `DebitAdjustment.Apply`, `Refund.Apply`, `Chargeback.Apply`  
- **Catalog Management**: `Product.Create`, `Product.Archive`, `OperationType.CreateWithArchival`
- **System Jobs**: `Operation.Cleanup`, `Lot.Expire`

## Error-to-Operation Mapping

### Purchase.Settled Command
| Error | Process Stage | Trigger Condition | Error Context |
|-------|---------------|-------------------|---------------|
| Product archived/not for sale | Product validation | Product.effective_at > settled_at OR Product.archived_at <= settled_at | Invalid product reference |
| Product not available in country | Pricing resolution | No matching country or "*" fallback in product.price_rows | Geographic availability issue |
| Pricing snapshot mismatch | Pricing validation | pricing_snapshot doesn't match current ListAvailableProducts(country) | Catalog state changed between checkout and settlement |
| Duplicate settlement | Idempotency check | Same external_ref already processed within 7-day window | Duplicate payment provider webhook |
| Database transaction failure | Transaction commit | Any database constraint violation or connection failure | Infrastructure issue |

### Operation.Open Command  
| Error | Process Stage | Trigger Condition | Error Context |
|-------|---------------|-------------------|---------------|
| Existing open operation | Precondition check | Existing record in open_operations for (merchant_id, user_id) | User has active operation in progress |
| Insufficient balance | Balance validation | calculateUserBalance(user_id) < 0 | User in debt, can't start new operations |
| Operation type not found | Type lookup | No active OperationType where operation_code matches and effective_at <= now < archived_at | Invalid or archived operation type |
| Operation type inactive | Type validation | OperationType exists but not currently active | Operation type lifecycle issue |

### Operation.RecordAndClose Command
| Error | Process Stage | Trigger Condition | Error Context |
|-------|---------------|-------------------|---------------|
| Operation not found | Operation lookup | operation_id not found in open_operations table | Invalid or expired operation reference |  
| Operation expired | Expiry check | operation.expires_at < current_time | Operation exceeded timeout period |
| Operation belongs to different user | Authorization check | operation.user_id != request.user_id | Security violation or malformed request |
| Resource unit mismatch | Unit validation | resource_unit != operation_type.resource_unit | Integration bug or API misuse |
| Invalid resource amount | Amount validation | resource_amount <= 0 OR resource_amount > reasonable_limit | Invalid consumption measurement |
| Workflow ID mismatch | Workflow validation | workflow_id provided in both Open and Close but different values | Inconsistent workflow context |
| No eligible lots for FIFO | Lot selection | selectOldestNonExpiredLot returns null | All user lots expired or consumed |
| Database transaction failure | Transaction commit | Ledger entry creation or operation update fails | Infrastructure issue |

### Grant.Apply Command (Welcome)
| Error | Process Stage | Trigger Condition | Error Context |
|-------|---------------|-------------------|---------------|
| Welcome grant already issued | Duplicate check | Existing LedgerEntry where reason = "welcome" for user_id | One-time grant already applied |
| No welcome product configured | Product lookup | No active Product where distribution = "grant" AND grant_policy = "apply_on_signup" | Merchant configuration missing |
| Welcome product inactive | Product validation | Welcome product exists but not currently active | Product lifecycle issue |

### Grant.Apply Command (Promo/Manual)
| Error | Process Stage | Trigger Condition | Error Context |
|-------|---------------|-------------------|---------------|
| Unauthorized caller | Authorization check | admin_actor not authorized for merchant context | Security violation |
| Invalid grant inputs | Input validation | credits <= 0 OR access_period_days <= 0 | Invalid grant parameters |
| Duplicate promo grant | Idempotency check | Same idempotency_key already processed within 7-day window | Duplicate admin action |

### CreditAdjustment.Apply Command
| Error | Process Stage | Trigger Condition | Error Context |
|-------|---------------|-------------------|---------------|
| Unauthorized caller | Authorization check | admin_actor not authorized for merchant context | Security violation |
| Missing justification | Input validation | justification is null or empty | Audit requirement not met |
| Negative credit amount | Amount validation | credit_amount <= 0 | Should be positive for credit adjustments |
| Duplicate adjustment | Idempotency check | Same idempotency_key already processed within 7-day window | Duplicate admin action |

### DebitAdjustment.Apply Command  
| Error | Process Stage | Trigger Condition | Error Context |
|-------|---------------|-------------------|---------------|
| Unauthorized caller | Authorization check | admin_actor not authorized for merchant context | Security violation |
| Missing justification | Input validation | justification is null or empty | Audit requirement not met |
| Positive debit amount | Amount validation | debit_amount >= 0 | Should be negative for debit adjustments |
| No eligible lots for debit | Lot selection | selectOldestNonExpiredLot returns null | All user lots expired |
| Duplicate adjustment | Idempotency check | Same idempotency_key already processed within 7-day window | Duplicate admin action |

### Product.Create Command
| Error | Process Stage | Trigger Condition | Error Context |
|-------|---------------|-------------------|---------------|
| Duplicate product code | Uniqueness check | product_code already exists in merchant catalog | Product identifier conflict |
| Invalid effective date | Date validation | effective_at is in the past | Lifecycle constraint violation |
| Invalid price structure | Price validation | Missing required price_rows for sellable products | Pricing configuration error |
| Grant policy mismatch | Policy validation | Grant product has prices OR sellable product has grant_policy | Distribution type conflict |

### Product.Archive Command
| Error | Process Stage | Trigger Condition | Error Context |
|-------|---------------|-------------------|---------------|
| Product not found | Product lookup | product_code doesn't exist in merchant catalog | Invalid product reference |
| Invalid archive date | Date validation | archived_at is in the past | Lifecycle constraint violation |
| Already archived | State validation | Product already has archived_at set | Duplicate archival attempt |

### Refund.Apply Command
| Error | Process Stage | Trigger Condition | Error Context |
|-------|---------------|-------------------|---------------|
| Missing external reference | Reference lookup | No Purchase settlement with matching external_ref | Invalid refund reference |
| Unauthorized caller | Authorization check | admin_actor not authorized for refund operations | Security violation |
| Missing justification | Input validation | justification is null or empty | Emergency refund requires justification |
| Already refunded | Duplicate check | Existing LedgerEntry where reason = "refund" and targets same purchase | Duplicate refund attempt |

### Chargeback.Apply Command
| Error | Process Stage | Trigger Condition | Error Context |
|-------|---------------|-------------------|---------------|
| Missing external reference | Reference lookup | No Purchase settlement with matching external_ref | Invalid chargeback reference |
| Already charged back | Duplicate check | Existing LedgerEntry where reason = "chargeback" and targets same purchase | Duplicate chargeback attempt |

### OperationType.CreateWithArchival Command
| Error | Process Stage | Trigger Condition | Error Context |
|-------|---------------|-------------------|---------------|
| Unauthorized caller | Authorization check | admin_actor not authorized for merchant context | Security violation |
| Invalid conversion rate | Rate validation | credits_per_unit <= 0 | Must be positive conversion rate |
| Invalid effective date | Date validation | effective_at is in the past | Lifecycle constraint violation |
| Concurrent rate change | Transaction conflict | Another OperationType update for same operation_code in progress | Race condition |

### Operation.Cleanup System Job
| Error | Process Stage | Trigger Condition | Error Context |
|-------|---------------|-------------------|---------------|
| Operation not found | Operation lookup | operation_id doesn't exist in open_operations | Already cleaned or never existed |
| Operation not expired | Expiry check | operation.expires_at > current_time | Cleanup running too early |
| Operation already closed | State validation | operation.status != "open" | Operation completed normally |

### Lot.Expire System Job
| Error | Process Stage | Trigger Condition | Error Context |
|-------|---------------|-------------------|---------------|
| Lot not found | Lot lookup | lot_id doesn't exist | Invalid expiry target |
| Lot not expired | Expiry check | lot.expires_at > current_time | Expiry job running too early |
| No positive credits | Balance check | calculateLotBalance(lot_id) <= 0 | Nothing to expire |
| Already processed | Duplicate check | Existing LedgerEntry where reason = "expiry" for lot_id | Duplicate expiry processing |

## Operation Flow Error Points

### Critical Error Points by Business Process
1. **Purchase Settlement**: Product validation → Pricing resolution → Transaction commit
2. **Operation Lifecycle**: Balance check → Type validation → Resource measurement → FIFO selection → Transaction commit  
3. **Admin Actions**: Authorization → Input validation → Idempotency check → Business rule validation
4. **System Jobs**: Target validation → State checking → Duplicate prevention → Processing

### Error Clustering by Root Cause
1. **Configuration Errors**: Invalid products, missing operation types, unauthorized access
2. **State Errors**: Expired operations, archived products, already processed items
3. **Integration Errors**: Unit mismatches, invalid amounts, malformed requests  
4. **Infrastructure Errors**: Database failures, transaction conflicts, connection issues

### Cross-Operation Error Patterns
- **Authorization failures**: Occur across all admin commands
- **Idempotency violations**: Occur across all commands with idempotency requirements
- **Database transaction failures**: Can occur in any command that writes to database
- **Invalid input errors**: Common across commands with complex input validation