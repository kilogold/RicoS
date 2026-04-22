# webhook-proxy

Bun + Express service that receives Stripe webhooks, decodes RicoS cart metadata against a versioned menu catalog, persists paid orders in a local libSQL (SQLite-compatible) database, and streams `order.paid` events to the kitchen relay over Server-Sent Events.

This README is the canonical reference for the proxy's **database schema, menu versioning, cart codec wire format, and migration path**. For project overview, installation, env files, and day-to-day dev workflow, see the root [README.md](../README.md).

## Contents

- [Role in the system](#role-in-the-system)
- [Running locally](#running-locally)
- [Environment variables](#environment-variables)
- [HTTP surface](#http-surface)
- [Database](#database)
- [Menu versioning](#menu-versioning)
- [Cart codec wire format](#cart-codec-wire-format)
- [Migration path: local → Vercel + Turso](#migration-path-local--vercel--turso)

## Role in the system

- Verifies Stripe webhook signatures.
- Resolves a cart's `menuVersion` against its local copy of the menu registry; decodes `cart_b64` into a hydrated `KitchenOrderPayload`.
- Cross-checks the recomputed cart total (`sum(line.lineExtendedTotalCents)`) against `paymentIntent.amount`; rejects mismatches.
- Writes one `kitchen_orders` row per accepted event (dedupe key: `stripe_event_id`).
- Broadcasts `order.paid` to every active SSE subscriber.
- Accepts `POST /print-ack` to delete rows after the kitchen-relay prints them.

Nothing durable lives outside libSQL. The process can be killed and restarted at any time; any undelivered tickets are re-broadcast from the DB on boot.

## Running locally

Use the root Bun scripts so repo-root `.env` and `.env.local` are loaded in the correct order:

```bash
bun run dev:webhook-proxy
```

Default local port is `4001`. Stripe webhook signing requires the Stripe CLI `listen` command to forward events (see step 4 in the root README).

## Environment variables

All env vars are sourced from the repo-root `.env` + `.env.local` (see root README).

| Name | Required | Default | Purpose |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | yes | — | Stripe API secret |
| `STRIPE_WEBHOOK_SECRET` | yes | — | Signing secret from `stripe listen` or a Dashboard endpoint |
| `WEBHOOK_PROXY_PORT` | yes | — | e.g. `4001` |
| `WEBHOOK_PROXY_DATABASE_URL` | no | `file:./data/webhook-proxy.db` | libSQL URL. Use a Turso `https://…` URL + token in production. |
| `PRINT_ACK_SECRET` | no | unset | When set, the relay must send `X-Print-Ack-Key: <secret>` on `POST /print-ack` |

## HTTP surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/webhook` | Stripe-signed webhook endpoint. Verifies signature, decodes cart, persists order, broadcasts SSE. |
| `GET` | `/stream` | SSE stream of `order.paid` events (consumed by `kitchen-relay`). Replays all unprinted rows on connect. |
| `POST` | `/print-ack` | Relay acknowledges a printed `stripe_event_id`; row is deleted. Requires `X-Print-Ack-Key` when `PRINT_ACK_SECRET` is set. |
| `GET` | `/health` | Liveness probe. |

## Database

libSQL client ([@libsql/client](https://github.com/tursodatabase/libsql-client-ts)), SQLite-compatible. Two tables managed by [`migrate()`](src/db.ts):

### `kitchen_orders`

One row per accepted `payment_intent.succeeded` event. Payload is a hydrated `KitchenOrderPayload` (item IDs, selections, recomputed prices).

| Column | Type | Notes |
|---|---|---|
| `stripe_event_id` | `TEXT PRIMARY KEY` | Idempotency key across webhook retries |
| `payload` | `TEXT` | JSON-encoded `KitchenOrderPayload` |
| `created_at` | `INTEGER` | Epoch ms |

### `menu_versions`

One row per published menu snapshot. Populated at boot from the shared in-code registry (see [Menu versioning](#menu-versioning)).

| Column | Type | Notes |
|---|---|---|
| `version` | `INTEGER PRIMARY KEY` | Matches `menuVersion` stamped on carts |
| `published_at` | `INTEGER NOT NULL` | Epoch ms from the version's `publishedAt` |
| `catalog_json` | `TEXT NOT NULL` | Canonical JSON of the full catalog |
| `decode_index` | `TEXT NOT NULL` | Canonical JSON of the flattened decode index |
| `content_hash` | `TEXT NOT NULL UNIQUE` | SHA-256 of `canonical_json(catalog)` |

At runtime the decoder reads from an in-process `Map<version, DecodeIndex>` populated during seed; the DB is not queried per webhook.

## Menu versioning

Decoded carts reference items, groups, and options **by positional index**, which only makes sense relative to a specific menu snapshot. The proxy and the web app agree on what "menu version N" means through the in-code registry in [`packages/shared/src/menu-versions/`](../packages/shared/src/menu-versions/):

- `v1.ts` — exports `{ version: 1, publishedAt, catalog }` with `catalog = menu.json`.
- `index.ts` — exports `MENU_VERSIONS`, `CURRENT_MENU_VERSION`, `buildDecodeIndex`, `getDecodeIndex`, `canonicalJson`.

### Seed-on-boot

After `migrate(db)`, the proxy calls `seedMenuVersions(db, MENU_VERSIONS)`:

- For each version in the registry:
  - **Absent from DB** → inserts `catalog_json`, `decode_index`, and `content_hash`.
  - **Present** → compares stored `content_hash` to `sha256(canonicalJson(catalog))`. **On mismatch, the proxy exits.** Published versions are immutable; drift means someone edited a published snapshot.
- Populates the in-process decode-index cache so hot-path decoding is synchronous and DB-free.

### Publishing a new menu version

1. Add `packages/shared/src/menu-versions/vN.ts` exporting `{ version: N, publishedAt, catalog }`.
2. Register it in `packages/shared/src/menu-versions/index.ts` and bump `CURRENT_MENU_VERSION` to `N`.
3. Deploy the web app (start stamping the new version) and the proxy (seed the new row) together.

### What must never change in a published version

Positional indices are load-bearing. Within a published `menuVersion`, **do not**:

- Reorder items, modifier groups, or options.
- Rename or remove any `id`.
- Alter `priceCents`, `priceDeltaCents`, or group `required`/`min`/`max`/`selectionType`.

Any of these changes requires a new version. The content-hash check will halt the proxy on boot if you violate this.

### Unknown version policy

A cart carrying an unregistered `menuVersion` is rejected with `invalid_cart_metadata`. There is no best-effort fallback; the proxy cannot price a cart without the matching snapshot.

## Cart codec wire format

The web app encodes cart metadata in [`packages/shared/src/cart-codec.ts`](../packages/shared/src/cart-codec.ts) and attaches it to the Stripe `PaymentIntent`. The proxy decodes it during `payment_intent.succeeded`.

### Stripe metadata shape

PaymentIntent metadata carries the cart as two keys:

- `cart_codec=rcs-cart-v1` — fixed external identifier.
- `cart_b64=<base64url(binary-cart-v1)>` — the raw binary payload.

Constraints:

- `cart_b64.length ≤ 500` (Stripe metadata value cap).
- Raw binary `≤ 375` bytes (derived from the base64url limit).
- Typical 1-line, 2-group cart: ~6 raw bytes / ~8 base64url characters.
- Payloads over the cap fail fast at `/api/create-payment-intent` with `Cart metadata too large`.

### Binary layout (codec v1)

Identifiers, prices, and derived totals **never travel on the wire**. They are reconstructed at decode time from the pinned menu version's decode index.

Envelope:

- `version` (1 byte) — `0x01`, codec version (independent of `menuVersion`).
- `menuVersion` (uvarint) — registry pointer.
- `lineCount` (uvarint).

Per line:

- `itemIndex` (uvarint) — index into the version's flattened item table.
- `quantity` (uvarint).
- For each group declared on the item (positional, menu order):
  - `selectionMask` — `ceil(options.length / 8)` bytes; bit N of byte `floor(N/8)` means option index N is selected.

`uvarint` = unsigned base-128 varint (little-endian, MSB-continuation). No fixed-width fields, no magic bytes.

### Pricing and integrity rules

- Prices come from the pinned menu version only. The proxy never trusts price data from the wire.
- The decoder reconstructs `unitBasePriceCents`, per-option `optionSurchargeCents`, `lineUnitTotalCents`, and `lineExtendedTotalCents`.
- The proxy recomputes the cart total as `sum(line.lineExtendedTotalCents)` and rejects the webhook if it does not match `paymentIntent.amount`. This is the only cross-check; no redundant total travels on the wire.
- Decode fails hard on any of: unknown `menuVersion`, unknown `itemIndex`, stray bits in a selection mask, or selection counts that violate the group's `required` / `min` / `max` / `single` rules.

## Migration path: local → Vercel + Turso

Today, this proxy runs on an on-prem host behind a Stripe CLI (or ngrok) tunnel. The target is to move webhook receipt into Vercel Route Handlers with Turso as the queue, leaving only the printer driver on-prem.

### What stays the same

- Stripe signature verification.
- Cart decoding and the codec wire format.
- Menu versioning (the registry ships with the web app, so Route Handlers have the same snapshots).
- `order.paid` SSE semantics and the relay's `POST /print-ack` contract.
- The kitchen-relay: only its upstream URL changes.

### What changes

- The HTTP handlers in [`src/index.ts`](src/index.ts) move into Vercel Route Handlers. Express is dropped.
- `WEBHOOK_PROXY_DATABASE_URL` flips from a local `file:` URL to a Turso `libsql://` URL + auth token. `@libsql/client` stays.
- Stripe (and Helius, later) call the Vercel domain directly. The tunnel goes away.

### Why the cloud still needs a database

Vercel workers start and stop; in-memory queues do not survive deploys or cold starts. The handler must persist the normalized order in `kitchen_orders` **before** returning 200 to Stripe, so a paid order is never lost when the kitchen PC is offline. SSE then emits from the persisted queue rather than requiring the relay to be online at webhook time.

### Cutover order

1. Stand up Vercel Route Handlers + Turso persistence; exercise end-to-end with Stripe/Helius test events.
2. Switch Stripe (and Helius) production webhooks to the Vercel domain; point the relay's `KITCHEN_WEBHOOK_PROXY_URL` at Vercel.
3. Retire the local proxy and the tunnel after a soak period with stable delivery.
4. Drain the local queue before cutover; migrate any still-outstanding `kitchen_orders` rows only if they actually exist at switch time.
