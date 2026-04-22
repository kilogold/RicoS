# RicoS

Monorepo for **RicoS** restaurant ordering: a **Next.js** storefront with **Stripe** Payment Element (guest checkout), a **webhook-proxy** that accepts Stripe webhooks and streams **`order.paid`** over **SSE**, a **kitchen-relay** printing service that subscribes to that stream and prints tickets, and shared **menu data** with stable opaque item IDs.

**Package manager: [Bun](https://bun.sh) only.** The repo uses `bun.lock`. Do not run `npm install`, `yarn`, or `pnpm` — installs are blocked by a root `preinstall` hook unless you bypass it (don’t).

## Layout

| Path | Description |
|------|-------------|
| [`web/`](web/) | Next.js App Router — menu, cart, checkout, confirmation |
| [`webhook-proxy/`](webhook-proxy/) | Bun + Express — Stripe webhook ingress, libSQL persistence, SSE fan-out. See [`webhook-proxy/README.md`](webhook-proxy/README.md) for DB schema, menu versioning, cart codec wire format, and migration plan. |
| [`kitchen-relay/`](kitchen-relay/) | Bun — SSE client + `GET /health`; prints tickets (console or CUPS) and POSTs ack to the proxy |
| [`packages/shared/`](packages/shared/) | Canonical `menu.json` and helpers (`getItemById`, Stripe kitchen metadata parsing, etc.) |

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

- `STRIPE_SECRET_KEY` — server-only; used by the storefront Route Handlers to create PaymentIntents and by **`webhook-proxy`** for Stripe webhook verification (`.env.local`)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — public key for Stripe.js (`.env.local`)

**Webhook proxy** (`webhook-proxy/`, root `.env` / `.env.local`):

- `STRIPE_SECRET_KEY` — Stripe API secret (`.env.local`)
- `STRIPE_WEBHOOK_SECRET` — signing secret from Stripe CLI `listen` or Dashboard webhook (`.env.local`)
- `WEBHOOK_PROXY_PORT` — required in `.env` (use `4001` locally)
- `WEBHOOK_PROXY_DATABASE_URL` — optional; default is `webhook-proxy/data/webhook-proxy.db` via libSQL `file:` URL
- `PRINT_ACK_SECRET` — optional shared secret; relay must send header `X-Print-Ack-Key` when set

**Kitchen relay** (printing only, root `.env` / `.env.local`):

- `KITCHEN_WEBHOOK_PROXY_URL` — base URL of the proxy (default `http://127.0.0.1:4001`)
- `KITCHEN_PRINTER_ADAPTER` — `console` or `lp` (required in `.env`)
- `PRINT_ACK_SECRET` — must match the proxy if the proxy sets it

Optional:

- `KITCHEN_PRINT_LOG` — if set, append each ticket to this file (e.g. `./kitchen-print.log`, can be in `.env` or `.env.local`)
- `KITCHEN_RELAY_PORT` — required in `.env` (use `4000` locally)

## Local development (v1)

1. **Install dependencies** (from repo root):

   ```bash
   bun install
   ```

2. **Configure env files**:

   - Copy `.env.example` to `.env` at the repo root.
   - Copy `.env.local.example` to `.env.local` at the repo root.
   - Fill real Stripe values in `.env.local`.

3. **Start backend + storefront** — **recommended in Cursor:** one integrated terminal per process.

   - Command Palette (**Cmd+Shift+P** / **Ctrl+Shift+P**) → **Tasks: Run Task** → **`RicoS: Dev bootstrap`**.  
     That starts **webhook-proxy**, **kitchen-relay**, and **web** in **three separate** terminal tabs (see [`.vscode/tasks.json`](.vscode/tasks.json)).  
     If tasks fail with **`bun: command not found`**, the workspace prepends **`~/.bun/bin`** (and common Homebrew paths) to `PATH` in [`.vscode/tasks.json`](.vscode/tasks.json) and [`.vscode/settings.json`](.vscode/settings.json); reload the window after pulling changes. On Windows, add your Bun install directory to `PATH` or extend `.vscode/tasks.json` `options.env` with `;`-separated paths.

   **From a normal shell** (no split tabs): run the three commands in three terminals, or `bun run dev:bootstrap` for printed instructions (it does not multiplex one session).

   Set `STRIPE_WEBHOOK_SECRET` for the **proxy** in `.env.local`. Set `KITCHEN_PRINTER_ADAPTER` (e.g. `console`) in `.env`.

4. **Forward Stripe webhooks to the proxy** (separate terminal; Stripe CLI auth):

   ```bash
   stripe listen --forward-to http://localhost:4001/webhook
   ```

   Paste the **`whsec_...`** secret into `.env.local` as `STRIPE_WEBHOOK_SECRET` and restart the proxy if it was already running.

   When a payment succeeds, the proxy persists the order and emits **`order.paid`** over SSE; the relay prints a kitchen ticket (and appends to `KITCHEN_PRINT_LOG` if set).

5. Open [http://localhost:3000](http://localhost:3000), add items, complete checkout with a [Stripe test card](https://stripe.com/docs/testing#cards) (e.g. `4242 4242 4242 4242`).

## Deploying the storefront on Vercel

- Connect the repo and set the **root directory** to `web` **or** deploy from the monorepo root with the appropriate app directory (your Vercel project settings).
- Set **Install Command** to `bun install` (and ensure the project uses Bun) so Vercel does not default to npm.
- Add `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in the Vercel project **Environment Variables**.
- The **webhook proxy** and **kitchen relay** are not deployed with the storefront in v1; they are intended to run on **localhost** for development and later on a **Raspberry Pi** (or similar always-on host) with a public HTTPS URL for Stripe webhooks (to the proxy) and a real printer adapter when you are ready.

## Kitchen stack on a Raspberry Pi (later)

- Run **`webhook-proxy`** and **`kitchen-relay`** under **systemd** (or another supervisor), with `KITCHEN_WEBHOOK_PROXY_URL` pointing at the proxy on the same host (or `http://127.0.0.1:4001`).
- Create a **live** webhook endpoint in the [Stripe Dashboard](https://dashboard.stripe.com/webhooks) pointing to `https://your-pi-or-tunnel/webhook` on the **proxy** port and set `STRIPE_WEBHOOK_SECRET` to that endpoint’s signing secret.
- Replace or extend the print layer in [`kitchen-relay/src/print.ts`](kitchen-relay/src/print.ts) for USB or network thermal printers (e.g. ESC/POS) as needed.

## Menu item IDs

Cart and API payloads use human-readable generic IDs (`item_...`, `cat_...`, `mod_...`, `opt_...` in `packages/shared/src/menu.json`). Keep IDs stable even if display copy changes.

Menu snapshots are versioned in [`packages/shared/src/menu-versions/`](packages/shared/src/menu-versions/); the web app stamps `CURRENT_MENU_VERSION` on every cart. The proxy validates and decodes against the same registry — see [`webhook-proxy/README.md`](webhook-proxy/README.md#menu-versioning) for seed-on-boot behavior, the `menu_versions` table, and the immutability rules.

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

The on-wire shape of the cart inside Stripe metadata (codec identifier, base64url payload, binary byte layout, integrity checks) is documented in [`webhook-proxy/README.md`](webhook-proxy/README.md#cart-codec-wire-format).

## Scripts (root `package.json`)

| Script | Command |
|--------|---------|
| Dev — bootstrap (split terminals in Cursor) | Command Palette → **Tasks: Run Task** → **RicoS: Dev bootstrap** (see [`.vscode/tasks.json`](.vscode/tasks.json)) |
| Dev — bootstrap hint (shell only) | `bun run dev:bootstrap` |
| Dev — web | `bun run dev:web` |
| Dev — webhook proxy | `bun run dev:webhook-proxy` |
| Dev — kitchen (printing relay) | `bun run dev:kitchen` |
| Build — web | `bun run build` |
| Lint — web | `bun run lint` |

Run root scripts (`bun run dev:web`, `bun run dev:webhook-proxy`, `bun run dev:kitchen`, etc.) so root `.env` and `.env.local` are always loaded in the correct order. For **three terminals at once** in Cursor, use the **RicoS: Dev bootstrap** task instead of one combined shell.

## Architecture

Two diagrams describe the system today (portable prototype running on a local host with tunnels) and the target (webhook receipt on Vercel with a hosted Turso queue, kitchen relay still on-prem). For the deeper backend technical details — libSQL client usage, what the `pending kitchen orders` queue stores, and the full cutover plan — see [`webhook-proxy/README.md`](webhook-proxy/README.md#migration-path-local--vercel--turso).

### Current approach (portable prototype)

The on-prem host runs **`webhook-proxy`** and **`kitchen-relay`**. The proxy receives Stripe/Helius webhooks through local tunnels, persists the normalized order in libSQL, and streams `order.paid` over SSE. The relay prints the ticket and acknowledges back to the proxy.

```mermaid
flowchart TB
  U[Customer Browser]

  subgraph Vercel frontend
    W[Storefront]
  end

  subgraph Providers
    S[Stripe]
    H[Helius]
  end

  subgraph Local
    T1[Stripe CLI tunnel]
    T2[ngrok tunnel]     
    
    subgraph proxy process
    X[Webhook proxy]
    end

    subgraph LSQL["Local SQLite file"]
    DB[(pending kitchen orders)]
    end

    subgraph relay process
    K[Printing relay]
    P[Printer adapter]
    end
  end

  U -->|Checkout + Order Confirmation| W
  W ---->|Create Stripe payment request| S
  S -.->|Stripe payment confirmation| W 
  W -->|Create Solana Pay payment request|W 
  W ---->|Solana Pay transaction|H
  H -.->|Solana Pay confirmation|W

  S -->|Webhook event| T1
  H -->|Webhook event| T2
  T1 -->|Forward webhook| X
  T2 -->|Forward webhook| X
  X -->|track print queue| DB
  X -->|SSE order.paid event| K
  K -->|SSE subscribe & POST print ack| X
  K -->|Print ticket| P
```

### Ideal approach (robust)

Stripe and Helius call **Vercel** directly. Route Handlers do the proxy's job and persist the queue in **Turso** (hosted libSQL). Only the **kitchen-relay** stays on-prem; it subscribes to Vercel's SSE stream over the shop's outbound internet.

```mermaid
flowchart TB
  U[Customer Browser]

  subgraph Vercel frontend
    W[Storefront]


  end
    subgraph Vercel backend
      X[Webhook proxy]
    end
  subgraph Turso
    TB[(pending kitchen orders)]
  end

  subgraph Providers
    S[Stripe]
    H[Helius]
  end

  subgraph Local
    subgraph relay process
      K[Printing relay]
      P[Printer adapter]
    end
  end

  U -->|Checkout + Order Confirmation| W
  W --->|Create Stripe payment request| S
  S -.->|Stripe payment confirmation| W
  W -->|Create Solana Pay payment request| W
  W ---->|Solana Pay transaction| H
  H -.->|Solana Pay confirmation| W

  S --->|Webhook event| X
  H --->|Webhook event| X
  X --->|track print queue| TB
  X ---->|SSE order.paid event| K
  K -->|SSE subscribe & POST print ack| X
  K -->|Print ticket| P
```

Cutover order, what stays the same, and what the relay actually sees are all in [`webhook-proxy/README.md`](webhook-proxy/README.md#migration-path-local--vercel--turso).
