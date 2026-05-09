# RicoS

Monorepo for RicoS online ordering.

- `web`: Next.js storefront + API routes (Stripe checkout, Solana polling confirmation, staff menu publish)
- `kitchen-relay`: Bun relay that consumes `order.paid` events and prints kitchen tickets
- `packages/shared`: Canonical menu and shared cart/menu utilities

## Current Runtime State

- Package manager is **Bun only** (`bun.lock` + install guard in root `preinstall`)
- Stripe and Helius webhook routes exist in `web`
- Solana order confirmation currently uses backend polling as primary ingestion

## Prerequisites

- **Bun** `>= 1.2.0` (Bun-only installs)
- **Turso** — DB + auth token (`TURSO_DATABASE_*`)
- **Stripe** — API keys + `STRIPE_WEBHOOK_SECRET`
- **Solana Pay** — `HELIUS_USDC_MINT`, `HELIUS_MERCHANT_RECIPIENT`, and `NEXT_PUBLIC_SOLANA_RPC_URL` on the same cluster
- **Kitchen relay** — `console` only needs Bun; `lp` needs CUPS (see `.env.example`)

## Environment

Copy and fill:

- `.env.example` -> `.env`
- `.env.local.example` -> `.env.local`

Root scripts load env in this order: `.env` then `.env.local` (local overrides shared defaults).

Core vars to set:

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `TURSO_DATABASE_URL`
- `TURSO_DATABASE_AUTH_TOKEN`
- `HELIUS_USDC_MINT`
- `HELIUS_MERCHANT_RECIPIENT`
- `KITCHEN_RELAY_PORT`
- `KITCHEN_PRINTER_ADAPTER`

Menu publish vars:

- `MENU_PUBLISH_MENU_JSON_URL` (raw GitHub URL to `main/packages/shared/src/menu.json`)
- `STAFF_MENU_PUBLISH_SECRET`
- `GITHUB_TOKEN` (only if the menu repo is private)

Optional vars are documented in `.env.example` and `.env.local.example`.

## Local Development

1. Install dependencies:
   ```bash
   bun install
   ```
2. Configure `.env` and `.env.local` from examples.
3. Start both processes:
   - Cursor task: `RicoS: Dev bootstrap`
   - Shell:
     ```bash
     bun run dev:web
     bun run dev:kitchen
     ```
4. Open [http://localhost:3000](http://localhost:3000) and run checkout with Stripe test card `4242 4242 4242 4242`.

## Root Scripts

- `bun run dev:bootstrap`
- `bun run dev:web`
- `bun run dev:kitchen`
- `bun run build`
- `bun run lint`

## Deploying `web` on Vercel

- Configure project to build with Bun (`bun install`)
- Set env vars used by `web` (Stripe, Turso, Solana, menu publish vars)
- Keep `kitchen-relay` deployed separately (on-prem/supervised host)

## Kitchen Relay (On-Prem)

- Run `kitchen-relay` under a supervisor (for example `systemd`)
- Point `KITCHEN_BACKEND_BASE_URL` to hosted `web`
- If using print ack auth, set matching `PRINT_ACK_SECRET` in `web` and relay
- Extend printing behavior in `kitchen-relay/src/component/ticket-printing/service.ts` as needed

## Menu Publish Workflow

Source of truth:

- Runtime menu is stored in Turso `menu_versions` (active version = max `version`)
- Git canonical file is `packages/shared/src/menu.json`

Operational flow:

1. Update `packages/shared/src/menu.json` and increment `catalogVersion` by exactly `+1`.
2. Merge to `main`.
3. After production deploy success, GitHub workflow `.github/workflows/menu-publish.yml` posts to:
   - `POST /api/staff/menu/publish`
   - `Authorization: Bearer <STAFF_MENU_PUBLISH_SECRET>`
4. API validates and writes new version when content changes.

Required workflow setup:

- Set `PUBLISH_URL` in `.github/workflows/menu-publish.yml`
- Add repo secret `STAFF_MENU_PUBLISH_SECRET` matching Vercel env

Manual fallback:

- Call `POST /api/staff/menu/publish` directly with bearer secret.

Checkout guard:

- Clients send `menuVersionSeen`; backend returns `409` on mismatch to force refresh.

## Architecture

See [C4 Model](docs/C4/workspace.dsl) for details.

```mermaid
%%{init: {'theme': 'dark'}}%%
graph LR
  linkStyle default stroke:#94a3b8,color:#e5e7eb

  subgraph diagram ["Container View: Online Ordering"]
    style diagram fill:#0b1220,stroke:#0b1220,color:#e5e7eb

    1["<div style='font-weight: bold'>Customer</div><div style='font-size: 70%; margin-top: 0px'>[Person]</div>"]
    style 1 fill:#111827,stroke:#94a3b8,color:#e5e7eb
    2["<div style='font-weight: bold'>Storefront Staff</div><div style='font-size: 70%; margin-top: 0px'>[Person]</div>"]
    style 2 fill:#111827,stroke:#94a3b8,color:#e5e7eb
    3("<div style='font-weight: bold'>Kitchen Relay</div><div style='font-size: 70%; margin-top: 0px'>[Software System]</div>")
    style 3 fill:#0f172a,stroke:#60a5fa,color:#bfdbfe
    11("<div style='font-weight: bold'>Stripe</div><div style='font-size: 70%; margin-top: 0px'>[Software System]</div><div style='font-size: 80%; margin-top:10px'>Stripe's payment processing<br />system</div>")
    style 11 fill:#1f2937,stroke:#9ca3af,color:#e5e7eb
    12("<div style='font-weight: bold'>Helius</div><div style='font-size: 70%; margin-top: 0px'>[Software System]</div><div style='font-size: 80%; margin-top:10px'>Solana network services</div>")
    style 12 fill:#1f2937,stroke:#9ca3af,color:#e5e7eb

    subgraph 5 ["Online Ordering"]
      style 5 fill:#0f172a,stroke:#60a5fa,color:#dbeafe

      10[("<div style='font-weight: bold'>Database</div><div style='font-size: 70%; margin-top: 0px'>[Container: SQL]</div><div style='font-size: 80%; margin-top:10px'>Stores payment state, kitchen<br />dispatch queue state, and<br />staff order lifecycle state.</div>")]
      style 10 fill:#111827,stroke:#60a5fa,color:#dbeafe
      6["<div style='font-weight: bold'>Admin Panel</div><div style='font-size: 70%; margin-top: 0px'>[Container: Typescript and Next.js]</div><div style='font-size: 80%; margin-top:10px'>Provides admin functionality<br />to the storefront staff.</div>"]
      style 6 fill:#111827,stroke:#60a5fa,color:#dbeafe
      7["<div style='font-weight: bold'>Web Client</div><div style='font-size: 70%; margin-top: 0px'>[Container: Typescript and Next.js]</div><div style='font-size: 80%; margin-top:10px'>Browser runtime for customer<br />ordering flows.</div>"]
      style 7 fill:#111827,stroke:#60a5fa,color:#dbeafe
      8("<div style='font-weight: bold'>Web Server</div><div style='font-size: 70%; margin-top: 0px'>[Container: Typescript and Next.js]</div><div style='font-size: 80%; margin-top:10px'>Serves customer/staff web<br />content and executes<br />server-rendered flows.</div>")
      style 8 fill:#111827,stroke:#60a5fa,color:#dbeafe
      9("<div style='font-weight: bold'>Web API</div><div style='font-size: 70%; margin-top: 0px'>[Container: Typescript and Next.js]</div><div style='font-size: 80%; margin-top:10px'>Operates RicoS payment<br />confirmation, kitchen<br />dispatch, and staff-driven<br />order lifecycle transitions.</div>")
      style 9 fill:#111827,stroke:#60a5fa,color:#dbeafe
    end

    11-. "<div>Send payment confirmation<br />event</div><div style='font-size: 70%'></div>" .->9
    3-. "<div>Acknowledge order ticket<br />printed</div><div style='font-size: 70%'></div>" .->9
    6-. "<div>Finalize or refund order from<br />staff console</div><div style='font-size: 70%'></div>" .->9
    7-. "<div>Create payment reference and<br />confirm paid order</div><div style='font-size: 70%'></div>" .->9
    7-. "<div>Charge customer card</div><div style='font-size: 70%'></div>" .->11
    7-. "<div>Submit Solana Pay transaction</div><div style='font-size: 70%'></div>" .->12
    9-. "<div>Verify payment reference<br />settlement status</div><div style='font-size: 70%'></div>" .->12
    9-. "<div>Track order lifecycle and<br />menu versions</div><div style='font-size: 70%'></div>" .->10
    9-. "<div>Notify newly paid order</div><div style='font-size: 70%'></div>" .->3
    1-. "<div>Orders from the web client</div><div style='font-size: 70%'></div>" .->7
    2-. "<div>Finalize/Refund orders</div><div style='font-size: 70%'></div>" .->6
    7-. "<div>Load customer web content and<br />server-rendered responses</div><div style='font-size: 70%'></div>" .->8
    6-. "<div>Load staff web content and<br />server-rendered responses</div><div style='font-size: 70%'></div>" .->8

  end
```

