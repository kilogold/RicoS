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

See [`.env.example`](.env.example).

**Web (`web/.env.local`):**

- `STRIPE_SECRET_KEY` — server-only; used by Route Handlers to create PaymentIntents
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — public; used by Stripe.js on the client

**Kitchen relay** (e.g. `kitchen-relay/.env` or exported in your shell):

- `STRIPE_SECRET_KEY` — same secret key (relay does not need publishable key)
- `STRIPE_WEBHOOK_SECRET` — signing secret from the webhook endpoint you configure (see below)

Optional:

- `KITCHEN_PRINT_LOG` — if set, append each ticket to this file (e.g. `./kitchen-print.log`)
- `KITCHEN_RELAY_PORT` — default `4000`

## Local development (v1)

1. **Install dependencies** (from repo root):

   ```bash
   bun install
   ```

2. **Configure Stripe keys** — copy `.env.example` to `web/.env.local` and fill in test keys.

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

Cart and API payloads use **opaque** menu IDs (`mi_...`, `cat_...` in `packages/shared/src/menu.json`). Rename or translate display names freely without changing IDs.

## Scripts (root `package.json`)

| Script | Command |
|--------|---------|
| Dev — web | `bun run dev:web` |
| Dev — kitchen | `bun run dev:kitchen` |
| Build — web | `bun run build` |
| Lint — web | `bun run lint` |

To run a script inside a workspace directly: `bun run dev --cwd web`, etc.
