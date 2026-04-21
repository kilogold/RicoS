# RicoS

Monorepo for **RicoS** restaurant ordering: a **Next.js** storefront with **Stripe** Payment Element (guest checkout), a **kitchen-relay** service that prints paid orders from **Stripe webhooks**, and shared **menu data** with stable opaque item IDs.

**Package manager: [Bun](https://bun.sh) only.** The repo uses `bun.lock`. Do not run `npm install`, `yarn`, or `pnpm` — installs are blocked by a root `preinstall` hook unless you bypass it (don’t).

## Layout

| Path | Description |
|------|-------------|
| [`web/`](web/) | Next.js App Router — menu, cart, checkout, confirmation |
| [`kitchen-relay/`](kitchen-relay/) | Express server — `POST /webhook` for Stripe, prints ticket to stdout / optional log file |
| [`packages/shared/`](packages/shared/) | Canonical `menu.json` and helpers (`getItemById`, etc.) |

## Prerequisites

- **[Bun](https://bun.sh)** 1.2+ (`bun --version`)
- **Stripe** account (test mode for local development)
- **Stripe CLI** for forwarding webhooks to localhost ([install](https://stripe.com/docs/stripe-cli))

## Environment variables

See [`.env.example`](.env.example) and [`.env.local.example`](.env.local.example).

**Root env loading policy: `.env` then `.env.local`**

Create env files at the repository root:

- `.env` for shared defaults (safe values only; may be committed if non-secret)
- `.env.local` for secrets and machine-specific overrides (gitignored)

Root Bun scripts load `.env` first, then `.env.local`, so local values override defaults.

- `STRIPE_SECRET_KEY` — server-only; used by Route Handlers to create PaymentIntents (`.env.local`)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — public key for Stripe.js (`.env.local`)

**Kitchen relay** (reads from root `.env` and `.env.local` via root scripts):

- `STRIPE_SECRET_KEY` — same secret key (`.env.local`)
- `STRIPE_WEBHOOK_SECRET` — signing secret from the webhook endpoint you configure (see below, `.env.local`)

Optional:

- `KITCHEN_PRINT_LOG` — if set, append each ticket to this file (e.g. `./kitchen-print.log`, can be in `.env` or `.env.local`)
- `KITCHEN_RELAY_PORT` — default `4000` (in `.env` by default)

## Local development (v1)

1. **Install dependencies** (from repo root):

   ```bash
   bun install
   ```

2. **Configure env files**:

   - Copy `.env.example` to `.env` at the repo root.
   - Copy `.env.local.example` to `.env.local` at the repo root.
   - Fill real Stripe values in `.env.local`.

3. **Start the kitchen relay** (terminal 1):

   ```bash
   bun run dev:kitchen
   ```

   Set `STRIPE_WEBHOOK_SECRET` for the relay. For local CLI forwarding, run Stripe listen (step 5) and use the **`whsec_...`** secret it prints.

4. **Start the storefront** (terminal 2):

   ```bash
   bun run dev:web
   ```

   Open [http://localhost:3000](http://localhost:3000), add items, complete checkout with a [Stripe test card](https://stripe.com/docs/testing#cards) (e.g. `4242 4242 4242 4242`).

5. **Forward webhooks to the relay** (terminal 3):

   ```bash
   stripe listen --forward-to http://localhost:4000/webhook
   ```

   Paste the webhook signing secret into `STRIPE_WEBHOOK_SECRET` for `kitchen-relay` and restart the relay if needed. When a payment succeeds, the relay logs a kitchen ticket (and appends to `KITCHEN_PRINT_LOG` if set).

## Deploying the storefront on Vercel

- Connect the repo and set the **root directory** to `web` **or** deploy from the monorepo root with the appropriate app directory (your Vercel project settings).
- Set **Install Command** to `bun install` (and ensure the project uses Bun) so Vercel does not default to npm.
- Add `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in the Vercel project **Environment Variables**.
- The **kitchen relay is not deployed here** in v1; it is intended to run on **localhost** for development and later on a **Raspberry Pi** (or similar always-on host) with a public HTTPS URL for Stripe webhooks and a real printer adapter when you are ready.

## Kitchen relay on a Raspberry Pi (later)

- Run the same `kitchen-relay` process under **systemd** (or another supervisor).
- Create a **live** webhook endpoint in the [Stripe Dashboard](https://dashboard.stripe.com/webhooks) pointing to `https://your-pi-or-tunnel/webhook` and set `STRIPE_WEBHOOK_SECRET` to that endpoint’s signing secret.
- Replace or extend the print layer in [`kitchen-relay/src/print.ts`](kitchen-relay/src/print.ts) for USB or network thermal printers (e.g. ESC/POS) as needed.

## Menu item IDs

Cart and API payloads use human-readable generic IDs (`item_...`, `cat_...`, `mod_...`, `opt_...` in `packages/shared/src/menu.json`). Keep IDs stable even if display copy changes.

## Predefined customizations (v1)

- Modifier groups are modeled in shared menu data and validated server-side.
- `cat_breakfast_griddles` requires two single-select groups on each line item:
  - Base choice: `(2) Pancakes` or `(1) Waffles` or `(2) French Toast`
  - Side choice: `Sausage` or `jamón` or `bacon`
- `item_western_omelette` (Western Omelette) includes a multi-select subtractive group:
  - `no tomate`, `no cebolla`, `no pimientos`, `no queso`

### Cart / checkout payload shape

- Cart lines are sent as:
  - `{ id: string, quantity: number, selections: { [modifierGroupId]: string[] } }`
- Server validation rejects:
  - unknown groups/options
  - missing required selections
  - invalid single-vs-multiple selection counts

### Stripe metadata shape

- PaymentIntent metadata stores one JSON-encoded line per index:
  - `line_count=<n>`
  - `line_0={"i":"<itemId>","q":<qty>,"s":{"<groupId>":["<optionId>"]}}`
- Kitchen relay parses this structure and resolves IDs to printable labels.
- This is v1; old metadata formats are intentionally not supported.

## Scripts (root `package.json`)

| Script | Command |
|--------|---------|
| Dev — web | `bun run dev:web` |
| Dev — kitchen | `bun run dev:kitchen` |
| Build — web | `bun run build` |
| Lint — web | `bun run lint` |

Run root scripts (`bun run dev:web`, `bun run dev:kitchen`, etc.) so root `.env` and `.env.local` are always loaded in the correct order.

## Architecture

### Current approach (cheap)

Local development keeps the relay on localhost and uses Stripe CLI to forward webhook events to `kitchen-relay`. This is low cost and quick to iterate on, but it depends on a running local tunnel process and is intended for prototyping rather than hardened production operations.

```mermaid
flowchart LR
  U[Customer Browser]

  subgraph Vercel
    W[Storefront]
  end

  subgraph Stripe
    S[Payments API and webhooks]
  end

  subgraph Local
    C[Stripe CLI listen]
    K[kitchen-relay on localhost:4000]
    P[Console or local printer adapter]
  end

  U -->|Checkout| W
  W -->|Create/confirm PaymentIntent| S
  S -->|Webhook events| C
  C -->|Forward to /webhook| K
  K -->|Print ticket| P
```

### Ideal approach (robust)

Production routes Stripe webhooks to a cloud endpoint, then delivers paid-order events to the on-prem relay through an outbound subscription channel (SSE). This avoids inbound NAT/ISP issues and supports stronger delivery semantics with idempotency and optional ack/replay.

```mermaid
flowchart LR
  U[Customer Browser]

  subgraph Vercel
    W[Storefront]
    H[Webhook handler]
    B[Event stream or durable queue]
    E[SSE endpoint]
  end

  subgraph Stripe
    S[Payments API and webhooks]
  end

  subgraph Local
    K[kitchen-relay on premises]
    P[Kitchen printer]
  end

  U -->|Checkout| W
  W -->|Create/confirm PaymentIntent| S
  S -->|payment_intent.succeeded webhook| H
  H -->|Normalize and publish| B
  K -->|Outbound SSE subscribe| E
  E -->|Consume events| B
  E -->|Push order paid event| K
  K -->|Print ticket| P
```
