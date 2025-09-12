# Effect Schema Index for Credit System

A comprehensive guide for using Effect Schema in the credit system domain entities, compiled from official Effect documentation.

## 🚨 Critical Migration Required

**Current Issue:** Codebase has mixed imports that need standardization.

**Current State:**
```typescript
// ❌ Deprecated (used in domain entities)
import { Schema } from "@effect/schema"

// ✅ Current official (used in knowledge docs)
import { Schema } from "effect"
```

**Action Required:** Update all domain entity imports to use `effect` package.

## Quick Reference Index

### 1. Import & Setup
- **Import Pattern**: `import { Schema } from "effect"`
- **Requirements**: TypeScript 5.4+, `strict` flag enabled
- **Schema Structure**: `Schema<Type, Encoded, Requirements>`

### 2. Domain Entity Patterns

#### Schema.Class for Entities (Current Pattern ✅)
```typescript
export class Product extends Schema.Class<Product>("Product")({
  product_code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50)),
  credits: Credits.pipe(Schema.greaterThan(0)),
  effective_at: Schema.Date,
  archived_at: Schema.OptionFromNullOr(Schema.Date)
}) {
  isActive(): boolean {
    const now = new Date()
    return this.effective_at <= now && Option.isNone(this.archived_at)
  }
}
```

#### Namespace Pattern (Current ✅)
```typescript
export namespace Product {
  export type Encoded = Schema.Schema.Encoded<typeof Product>
  export type Context = Schema.Schema.Context<typeof Product>
}
```

### 3. Validation Patterns

#### Basic Validation (Current ✅)
```typescript
export const Credits = Schema.Number.pipe(
  Schema.int(),
  Schema.filter((n) => n !== 0),
  Schema.brand("Credits")
)
```

#### Business Rules Validation (Current ✅)
```typescript
export const ProductValidated = Product.pipe(
  Schema.filter((p) =>
    (p.distribution === "grant" && Option.isSome(p.grant_policy)) ||
    (p.distribution === "sellable" && Option.isNone(p.grant_policy))
  )
)
```

#### Custom Error Messages
```typescript
const ProductCode = Schema.String.pipe(
  Schema.minLength(1),
  Schema.annotations({
    message: () => "Product code must be a non-empty string"
  })
)
```

### 4. Effect Integration

#### Option Handling (Current ✅)
```typescript
// Recommended for nullable fields
grant_policy: Schema.OptionFromNullOr(GrantPolicy),
archived_at: Schema.OptionFromNullOr(Schema.Date)
```

#### Effect Data Types
- `Schema.Option(schema)` - Full Option serialization
- `Schema.OptionFromNullOr(schema)` - null/undefined as None ✅ 
- `Schema.OptionFromUndefinedOr(schema)` - undefined as None
- `Schema.Either(left, right)` - Either type support

### 5. Error Handling

#### Decoding Functions
```typescript
// Synchronous (throws on error)
const decoded = Schema.decodeUnknownSync(Product)(rawData)

// Either-based (recommended for domain logic)
const result = Schema.decodeUnknownEither(Product)(rawData)
if (Either.isLeft(result)) {
  // Handle validation errors
}

// Effect-based (for async transformations)
const effect = Schema.decodeUnknown(Product)(rawData)
```

### 6. Advanced Patterns

#### Branded Types (Partial ✅)
```typescript
export const UserId = Schema.String.pipe(
  Schema.brand("UserId"),
  Schema.annotations({
    message: () => "Invalid user ID format"
  })
)
export type UserId = Schema.Schema.Type<typeof UserId>
```

#### Transformations for External Systems
```typescript
const ProductForAPI = Product.pipe(
  Schema.transform(
    Schema.Struct({
      code: Schema.String,
      name: Schema.String,
      credits_count: Schema.Number
    }),
    {
      decode: (api) => new Product({
        product_code: api.code,
        title: api.name,
        credits: api.credits_count
      }),
      encode: (product) => ({
        code: product.product_code,
        name: product.title,
        credits_count: product.credits
      })
    }
  )
)
```

#### JSONB Field Handling (Current ✅)
```typescript
// Flexible Record for JSONB columns
purchase_snapshot: Schema.Record({
  key: Schema.String,
  value: Schema.Unknown
}),
```

### 7. Use Case Categories

#### Value Objects
- **Purpose**: Immutable, validated primitives
- **Examples**: `UserId`, `Credits`, `ProductCode`
- **Pattern**: Branded strings/numbers with validation

#### Domain Entities  
- **Purpose**: Business objects with behavior
- **Examples**: `Product`, `LedgerEntry`, `Receipt`
- **Pattern**: Schema.Class with domain methods

#### Business Rule Validation
- **Purpose**: Cross-field invariants
- **Examples**: `ProductValidated`, `LedgerEntryValidated`
- **Pattern**: Schema.filter with complex conditions

#### External Integration
- **Purpose**: API/Database transformations
- **Pattern**: Schema.transform for format conversion

### 8. Testing Patterns

#### Test Helpers (Current ✅)
```typescript
export const runTestEffect = <A, E, R>(effect: Effect.Effect<A, E, R>): Either.Either<A, E> => {
  return Effect.runSync(Effect.either(effect as Effect.Effect<A, E, never>))
}

export const expectRight = <A, E>(result: Either.Either<A, E>): A => {
  expect((result as any)._tag).toBe("Right")
  return (result as any).right as A
}
```

#### Test Usage
```typescript
it("validates product creation", () => {
  const result = runTestEffect(Schema.decodeUnknown(Product)(validData))
  const product = expectRight(result)
  expect(product.isActive()).toBe(true)
})
```

## Quick Navigation

### Most Relevant Documentation Links
1. **[Schema Classes](https://effect.website/docs/schema/classes/)** - Domain entity pattern
2. **[Filters](https://effect.website/docs/schema/filters/)** - Business rule validation  
3. **[Effect Data Types](https://effect.website/docs/schema/effect-data-types/)** - Option/Either integration
4. **[Basic Usage](https://effect.website/docs/schema/basic-usage/)** - Common patterns
5. **[Error Handling](https://effect.website/docs/schema/error-messages/)** - Validation errors
6. **[Transformations](https://effect.website/docs/schema/transformations/)** - External system integration

### Migration Checklist
- [x] Update imports from `@effect/schema` to `effect` ✅ Completed 
- [ ] Add custom error messages for better validation feedback
- [ ] Consider more branded types for type safety
- [ ] Add transformation schemas for database/API integration
- [ ] Expand business rule validation using schema-level filters

### Current Strengths in Codebase
✅ Schema.Class usage for domain entities  
✅ Business rule validation with Schema.filter  
✅ Option integration with OptionFromNullOr  
✅ Comprehensive test coverage with helpers  
✅ Proper namespace exports  
✅ JSONB field handling with flexible Records  

This index provides quick access to Schema patterns most relevant for credit system development while building on existing solid architectural decisions.