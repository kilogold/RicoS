# `web/` Architecture Contract

This contract aligns `web/` code ownership to the `commerce` software system in `docs/C4/workspace.dsl`.

## Boundary ownership

- `app/`
  - Next.js transport adapters only (routes, pages, layout wiring).
  - No business orchestration.
- `components/`
  - Presentation components only.
  - Can consume hooks/view-models from `lib/commerce/web-client/*`.
- `lib/commerce/web-client/`
  - Customer checkout and ordering flows.
  - C4 `web_client` components:
    - `stripe-checkout`
    - `solana-pay-checkout`
- `lib/commerce/web-api/`
  - Server business logic behind HTTP handlers.
  - C4 `api` components:
    - `stripe-payment`
    - `solana-payment`
    - `kitchen-order-dispatch`
    - `staff-order-management` (placeholder)
- `lib/commerce/domain/`
  - Cross-component domain contracts and policies.
  - No framework and no infrastructure imports.
- `lib/infrastructure/`
  - External system adapters and runtime services:
    - `stripe`
    - `helius`
    - `turso`
    - `sse`
- `lib/shared/`
  - Shared app utilities (copy, config helpers, generic errors).

## Import direction

Allowed:

1. `app/*` -> `lib/commerce/*/adapters/http`
2. `components/*` -> `lib/commerce/web-client/*` and `lib/shared/*`
3. `lib/commerce/*/use-cases` -> `lib/commerce/*/ports` -> `lib/infrastructure/*`

Disallowed:

1. `app/*` -> `lib/infrastructure/*` directly
2. `components/*` -> `lib/commerce/web-api/*`
3. `lib/commerce/domain/*` -> `app/*`, `components/*`, or `lib/infrastructure/*`
4. Deep imports that bypass a boundary's public `index.ts`

## Public entrypoints

Each boundary exposes an `index.ts` entrypoint. Consumers import only from entrypoints, never from internal subpaths unless they are inside the same boundary.

## Migration stance

- Favor behavior-preserving moves.
- Use compatibility re-exports only during migration windows.
- Remove compatibility paths once imports are fully switched and lint passes.
