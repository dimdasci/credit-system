# Schema.Struct vs Schema.Class Analysis for API Contracts

## Overview

This document analyzes why `Schema.Struct` was chosen over `Schema.Class` for RPC API contracts in the credit system, based on comprehensive review of Effect Schema documentation (6,020 lines across 5 files).

## Current Schema Usage in RPC Contracts

The codebase currently uses `Schema.Struct` for all API contracts:

- **health.ts:4** - `Schema.Struct({ status: Schema.Literal("ok") })`
- **admin.ts:4,6,11,13** - Multiple request/response structs
- **version.ts:4** - Version information struct

## Why Schema.Struct is the Correct Choice

### 1. Data Transfer Objects (DTOs)

RPC contracts define data transfer objects that represent the shape of data being transmitted over the network:

- **Schema.Struct**: Designed for defining object schemas with specific properties - perfect for DTOs
- **Schema.Class**: Creates actual class instances with methods, getters, and identity behavior

For API contracts, you want simple data structures, not class instances with behavior.

### 2. JSON Compatibility

From Effect Schema documentation (lines 947-974): The Schema module prioritizes JSON compatibility. `Schema.Struct` produces plain objects that serialize naturally to JSON, while `Schema.Class` creates class instances that would need transformation during encoding.

### 3. Functional Programming Alignment

The project follows functional programming principles with Effect. `Schema.Struct` aligns with this by producing immutable readonly data structures, while `Schema.Class` introduces object-oriented patterns that don't fit the functional approach.

### 4. Transformation Overhead

From the Class documentation (lines 120-134): "Class schemas are transformations" - they transform plain objects into class instances during decoding and back to plain objects during encoding. This adds unnecessary overhead for simple API contracts.

### 5. Type Safety Without Complexity

`Schema.Struct` provides complete type safety and validation without the additional complexity of:

- Constructor validation (lines 420-445)
- Automatic hashing/equality (lines 474-528)
- Method definitions
- Identity management

### 6. API Contract Simplicity

API contracts should be simple data definitions. The current contracts like:

```typescript
export const Health = Schema.Struct({ status: Schema.Literal("ok") })
```

are clear, minimal, and focused on data shape rather than behavior.

### 7. Lean System Philosophy

From CLAUDE.md: "We build focused, minimal systems that do one thing well." Using `Schema.Struct` for simple data shapes follows this philosophy, while `Schema.Class` would add unnecessary complexity.

### 8. RPC Pattern Match

RPC systems typically work with plain data objects for requests/responses. The Effect RPC system (which the project is converting to) expects simple schemas for defining the contract shapes, not class-based transformations.

## When to Use Schema.Class

The documentation shows `Schema.Class` is appropriate when you need:

- Shared functionality via methods/getters
- Value equality and hashing behavior
- Constructor validation
- Domain objects with behavior

None of these requirements apply to API contracts.

## Conclusion

`Schema.Struct` was definitively the correct choice for RPC contracts because:

1. **Purpose-built for DTOs**: Designed exactly for defining object shapes
2. **JSON-first**: Natural serialization for web APIs
3. **Performance**: No transformation overhead
4. **Simplicity**: Minimal, focused on data structure
5. **Functional**: Immutable readonly objects
6. **Standards**: Aligns with RPC/API contract conventions

The current Schema usage is architecturally sound and should be maintained during the RPC conversion in Task #70.

## Reference Documentation

This analysis is based on complete review of Effect Schema documentation:

- `11_effect_schema_index.mdx` (217 lines) - Schema overview and concepts
- `11_01_effect_schema_start.mdx` (974 lines) - Getting started and basic usage
- `11_02_effect_schema_basics.mdx` (2,020 lines) - Primitives, structs, and basic patterns
- `11_03_effect_schema_filters.mdx` (607 lines) - Validation and filtering
- `11_04_effect_schema_advanced.mdx` (2,207 lines) - Advanced usage including classes

**Total**: 6,025 lines of comprehensive Effect Schema documentation reviewed.