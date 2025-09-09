# Architectural Principles: Code Structure & Separation of Concerns

## Guiding Principle: Contracts vs. Implementation

The most critical principle for maintaining a clean and scalable architecture in this project is the strict separation between the **API Contract** (the "what") and the **Implementation** (the "how").

*   **Contracts (`packages/rpc`):** Define the shape of the API—its endpoints, schemas, and groups. They are pure, technology-agnostic definitions and must contain **no business logic or implementation details**.
*   **Implementation (`apps/server`):** Consumes the contracts and provides the concrete logic for each endpoint. This is where business logic, database access, and middleware are wired together.

This separation is what allows us to have multiple, independent consumers (like the CLI) and to evolve the server's internal logic without breaking the public-facing contract.

---

### 1. Monorepo Structure and Dependency Rules

To enforce the "Contracts vs. Implementation" principle, we must follow strict rules about what code lives in which package.

#### **Rule 1.1: The `rpc` Package is for Contracts ONLY.**

*   **Rationale:** The `rpc` package defines the public surface of our service. It must remain pure and have zero dependencies on any server-side implementation details. This prevents implementation logic from leaking into the public contract.
*   **Lesson Learned:** We initially tried to apply the `Authorization` middleware to an `HttpApiGroup` directly within the `rpc` package. This was an architectural error because it coupled the API contract to a specific server-side middleware.
*   **Guideline:**
    *   **DO:** Define `HttpApiEndpoint` and `HttpApiGroup` with their schemas in `packages/rpc`.
    *   **DON'T:** Import any services, middleware, or implementation logic from `apps/server` or `packages/shared` into `packages/rpc`. An `import` statement is a dependency. If the RPC contract needs to know about a service, it should only be via an abstract `Context.Tag` defined in a shared, agnostic package.

#### **Rule 1.2: The `server` App is the Composition Root.**

*   **Rationale:** The server is the single place where the abstract contracts are brought to life. It is responsible for composing all the pieces: API contracts, middleware, business logic services, and database layers.
*   **Lesson Learned:** The correct pattern for applying security is to do it within the server's composition root (`Api.ts`). The server takes the pure `AdminApiGroup` contract and applies the `Authorization` middleware to it, creating a new, protected group *on the server side*.
*   **Guideline:**
    *   **DO:** Import contracts from `rpc` and middleware/services from within the `server` app (or `shared` package) and combine them in `apps/server/src/Api.ts`.
    *   **DO:** Create different compositions for different needs. We created a public admin group and a protected admin group *on the server* by consuming the same underlying RPC contract.

---

### 2. Middleware and Service Provision in Effect

This is the runtime application of our separation of concerns, and Effect has a specific, idiomatic pattern for it.

#### **Rule 2.1: Define the Complete API Shape Before Implementing Groups.**

*   **Rationale:** Effect's `HttpApiBuilder` is powerful but needs a complete picture of the final API to correctly resolve all dependencies, especially those provided by middleware. If it doesn't know that a handler for one group will eventually need a service provided by middleware on another group, it cannot wire them together, leading to runtime errors.
*   **Lesson Learned:** We directly experienced the `Service not found: MerchantContext` runtime error. This was because we were implementing each `HttpApiGroup` against a temporary, partial `HttpApi` definition. The builder had no way of knowing that the `AdminApiLive` handler's requirement for `MerchantContext` would be fulfilled by the `Authorization` middleware applied to the `AdminApiGroup`.
*   **Guideline:**
    1.  First, create a single `CombinedApi` constant that `.add()`s all `HttpApiGroup`s and applies all necessary `.middleware()` requirements. This object represents the final, complete shape of your API.
    2.  Then, when implementing each group, pass this same `CombinedApi` constant to every `HttpApiBuilder.group()` call.
    3.  Finally, provide all the implementation `Layer`s to `HttpApiBuilder.api(CombinedApi)`.

This pattern ensures that Effect's dependency injection system has the full context it needs to correctly provide services from middleware to the handlers that require them.
