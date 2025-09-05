# Step 2: Error-to-Actor Mapping Analysis

## Purpose
Analyze who encounters each error from our domain catalog and their specific context when encountering the error.

## Actor Categories
- **End User**: Person using the upstream application (via UI)
- **Upstream Application**: The B2C application that calls our credit service
- **Admin Operator**: Person using CLI or admin interfaces
- **System**: Background processes and automated systems

## Error-to-Actor Mapping

### Purchase Settlement Errors
| Error | Who Encounters | Context | Action Required |
|-------|---------------|---------|-----------------|
| Product archived/not for sale | Upstream App | During `Purchase.Settled` call | Handle gracefully, show user alternative products |
| Product not available in country | Upstream App | During `Purchase.Settled` call | Handle gracefully, show user alternative products or pricing |
| Pricing snapshot mismatch | Upstream App | During `Purchase.Settled` call | Refresh product catalog, retry with current pricing |
| Duplicate settlement (external_ref) | Upstream App | During `Purchase.Settled` call | Return existing settlement result (idempotent) |
| Settlement database error | Upstream App | During `Purchase.Settled` call | Show user generic error, retry later |

### Operation Lifecycle Errors
| Error | Who Encounters | Context | Action Required |
|-------|---------------|---------|-----------------|
| User has active operation | Upstream App | During `Operation.Open` call | Show user current operation status, let them complete or wait |
| Insufficient balance | End User (via App) | During `Operation.Open` call | Prompt user to purchase more credits |
| Operation type not found/inactive | Upstream App | During `Operation.Open` call | Use fallback operation type or show service unavailable |
| Invalid inputs | Upstream App | During `Operation.Open` call | Fix integration bug, validate inputs client-side |
| Operation not found | Upstream App | During `Operation.RecordAndClose` call | Handle as expired operation, start new one |
| Operation expired | Upstream App | During `Operation.RecordAndClose` call | Inform user operation timed out, start new one |
| Resource unit mismatch | Upstream App | During `Operation.RecordAndClose` call | Fix integration bug, ensure unit consistency |
| Invalid resource amount | Upstream App | During `Operation.RecordAndClose` call | Fix integration bug, validate amounts |
| Workflow_id mismatch | Upstream App | During `Operation.RecordAndClose` call | Fix integration bug, maintain workflow context |

### Grant and Adjustment Errors  
| Error | Who Encounters | Context | Action Required |
|-------|---------------|---------|-----------------|
| Welcome grant already issued | Upstream App | During signup `Grant.Apply` call | Skip grant, continue normal flow |
| No configured welcome product | Admin Operator | Via monitoring/logs when grants fail | Configure welcome grant product |
| Unauthorized caller (grants) | Admin Operator | During manual `Grant.Apply` call | Check authentication/authorization |
| Invalid grant inputs | Admin Operator | During manual `Grant.Apply` call | Fix input validation, retry with correct values |
| Unauthorized caller (adjustments) | Admin Operator | During `CreditAdjustment.Apply` call | Check authentication/authorization |
| Negative credits (credit adjustment) | Admin Operator | During `CreditAdjustment.Apply` call | Use positive amount for credit adjustments |
| Positive amount (debit adjustment) | Admin Operator | During `DebitAdjustment.Apply` call | Use negative amount for debit adjustments |

### Product Catalog Errors
| Error | Who Encounters | Context | Action Required |
|-------|---------------|---------|-----------------|
| Duplicate product codes | Admin Operator | During `Product.Create` call | Use unique product code |
| Selling archived products | Upstream App | When trying to sell inactive products | Update product catalog, use active products |
| Invalid archive date (past) | Admin Operator | During `Product.Archive` call | Use current or future date for archival |

### Refund/Chargeback Errors
| Error | Who Encounters | Context | Action Required |
|-------|---------------|---------|-----------------|
| Missing external_ref linkage | Admin Operator | During `Refund.Apply` call | Verify external reference exists |
| Insufficient authorization (refund) | Admin Operator | During `Refund.Apply` call | Get proper authorization for refund |
| Purchase already refunded | Admin Operator | During `Refund.Apply` call | Check existing refund status |
| Purchase already charged back | Admin Operator | During `Chargeback.Apply` call | Check existing chargeback status |

### Operation Type Management Errors
| Error | Who Encounters | Context | Action Required |
|-------|---------------|---------|-----------------|
| Invalid conversion rate | Admin Operator | During `OperationType.CreateWithArchival` call | Use valid positive conversion rate |
| Effective date in past | Admin Operator | During `OperationType.CreateWithArchival` call | Use current or future effective date |
| Concurrent rate changes | System | During atomic operation type updates | Retry transaction |

### System/Background Job Errors
| Error | Who Encounters | Context | Action Required |
|-------|---------------|---------|-----------------|
| Operation not found (cleanup) | System | During `Operation.Cleanup` job | Skip already cleaned operations |
| Operation not expired (cleanup) | System | During `Operation.Cleanup` job | Skip not-yet-expired operations |
| Lot already processed (expiry) | System | During `Lot.Expire` job | Skip already expired lots |
| No positive credits (expiry) | System | During `Lot.Expire` job | Skip lots with no credits to expire |

## Key Insights

### Error Encounter Patterns
1. **Upstream App errors**: Mostly need graceful handling with user-friendly messages
2. **Admin Operator errors**: Need clear diagnostic information for correction
3. **System errors**: Need automated retry and failure logging
4. **End User errors**: Presented through upstream app with actionable guidance

### Context Importance
- **Upstream App**: Needs to handle errors gracefully without exposing internal details
- **Admin Operator**: Needs detailed context for troubleshooting and correction
- **System**: Needs to log errors for monitoring and handle retries automatically
- **End User**: Needs clear, actionable error messages in familiar business terms

### Actor-Specific Error Handling Needs
- **End Users**: Simple, actionable messages ("Add more credits", "Try again later")
- **Upstream Apps**: Error codes with retry guidance and fallback options
- **Admin Operators**: Detailed diagnostic info with specific correction steps
- **System**: Structured logging with retry policies and alerting