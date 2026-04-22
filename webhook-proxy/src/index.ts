import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Response } from "express";
import Stripe from "stripe";
import { MENU_VERSIONS } from "@ricos/shared";
import {
  defaultDatabaseUrl,
  deletePending,
  listPending,
  migrate,
  seedMenuVersions,
  type KitchenOrderPayload,
  openDb,
} from "./db.js";
import { parseStripeIngressEvent } from "./ingress/stripe-adapter.js";
import {
  parseHeliusIngressPayload,
  type HeliusIngressConfig,
} from "./ingress/helius-adapter.js";
import { IngressProcessError, processIngressEvent } from "./ingress/process.js";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const webhookProxyPortRaw = process.env.WEBHOOK_PROXY_PORT?.trim();
const printAckSecret = process.env.PRINT_ACK_SECRET?.trim();
const databaseUrl = process.env.WEBHOOK_PROXY_DATABASE_URL?.trim() || defaultDatabaseUrl();
const heliusAuthHeaderName =
  process.env.HELIUS_WEBHOOK_AUTH_HEADER_NAME?.trim().toLowerCase() || "x-helius-auth";
const heliusAuthHeaderValue = process.env.HELIUS_WEBHOOK_AUTH_HEADER_VALUE?.trim();
const heliusUsdcMint = process.env.HELIUS_USDC_MINT?.trim();
const heliusMerchantRecipient = process.env.HELIUS_MERCHANT_RECIPIENT?.trim();

function ensureParentDirForFileUrl(url: string): void {
  if (!url.startsWith("file:")) return;
  const filePath = fileURLToPath(url);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

if (!stripeSecret) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}
if (!webhookSecret) {
  console.error("Missing STRIPE_WEBHOOK_SECRET");
  process.exit(1);
}
if (!webhookProxyPortRaw) {
  console.error("Missing WEBHOOK_PROXY_PORT");
  process.exit(1);
}
if (!heliusUsdcMint) {
  console.error("Missing HELIUS_USDC_MINT");
  process.exit(1);
}
if (!heliusMerchantRecipient) {
  console.error("Missing HELIUS_MERCHANT_RECIPIENT");
  process.exit(1);
}

const port = Number(webhookProxyPortRaw);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error("WEBHOOK_PROXY_PORT must be a valid TCP port (1-65535)");
  process.exit(1);
}

ensureParentDirForFileUrl(databaseUrl);
const db = openDb(databaseUrl);
await migrate(db);
await seedMenuVersions(db, MENU_VERSIONS);

const stripe = new Stripe(stripeSecret);
const app = express();
const heliusConfig: HeliusIngressConfig = {
  authHeaderName: heliusAuthHeaderName,
  authHeaderValue: heliusAuthHeaderValue,
  expectedUsdcMint: heliusUsdcMint,
  expectedRecipient: heliusMerchantRecipient,
};

/** SSE subscribers (Express response objects). */
const sseClients = new Set<Response>();

function sseWrite(res: Response, event: string, data: string): void {
  res.write(`event: ${event}\ndata: ${data}\n\n`);
}

function broadcastOrderPaid(payload: KitchenOrderPayload): void {
  const data = JSON.stringify(payload);
  for (const res of sseClients) {
    try {
      sseWrite(res, "order.paid", data);
    } catch {
      sseClients.delete(res);
    }
  }
}

async function processOneIngressEvent(
  ingressEvent: {
    ingressEventId: string;
    paymentReferenceId: string;
    amountCents: number;
    currency: string;
    metadata: Record<string, string | undefined>;
    provider: "stripe" | "helius";
  },
): Promise<{ ok: true } | { ok: false; status: number; body: Record<string, string> }> {
  try {
    await processIngressEvent(db, ingressEvent, broadcastOrderPaid);
    return { ok: true };
  } catch (err) {
    if (err instanceof IngressProcessError) {
      if (err.code === "persist_failed") {
        console.error("kitchen_orders insert failed:", err.message);
        return { ok: false, status: 500, body: { error: err.code } };
      }
      console.error(`Ingress ${ingressEvent.provider} rejected:`, err.message);
      return { ok: false, status: 400, body: { error: err.code } };
    }
    console.error("Unexpected ingress processing error:", err);
    return { ok: false, status: 500, body: { error: "persist_failed" } };
  }
}

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const pending = await listPending(db);
  for (const row of pending) {
    sseWrite(res, "order.paid", JSON.stringify(row));
  }

  sseClients.add(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      clearInterval(keepAlive);
      sseClients.delete(res);
    }
  }, 25_000);

  const onEnd = () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  };
  req.on("close", onEnd);
  req.on("aborted", onEnd);
});

app.post("/print-ack", express.json(), async (req, res) => {
  if (printAckSecret) {
    const key = req.headers["x-print-ack-key"];
    if (key !== printAckSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  const stripeEventId = (req.body as { stripeEventId?: unknown }).stripeEventId;
  if (typeof stripeEventId !== "string" || !stripeEventId.startsWith("evt_")) {
    res.status(400).json({ error: "Invalid stripeEventId" });
    return;
  }
  await deletePending(db, stripeEventId);
  res.status(204).end();
});

app.post("/webhook/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const parsed = await parseStripeIngressEvent({
    body: req.body as Buffer,
    signature:
      typeof req.headers["stripe-signature"] === "string"
        ? req.headers["stripe-signature"]
        : undefined,
    stripe,
    webhookSecret,
  });
  if (parsed.kind === "error") {
    console.error("Stripe ingress rejected:", parsed.message);
    res.status(parsed.status).send(parsed.message);
    return;
  }
  if (parsed.kind === "ignore") {
    res.json({ received: true, ignored: true });
    return;
  }

  const outcome = await processOneIngressEvent(parsed.event);
  if (!outcome.ok) {
    res.status(outcome.status).json(outcome.body);
    return;
  }

  res.json({ received: true });
});

app.post("/webhook/helius", express.json({ limit: "1mb" }), async (req, res) => {
  const parsed = parseHeliusIngressPayload({
    body: req.body,
    headers: req.headers,
    config: heliusConfig,
  });
  if (parsed.kind === "error") {
    console.error("Helius ingress rejected:", parsed.message);
    res.status(parsed.status).json({ error: parsed.message });
    return;
  }

  for (const event of parsed.events) {
    const outcome = await processOneIngressEvent(event);
    if (!outcome.ok) {
      res.status(outcome.status).json(outcome.body);
      return;
    }
  }

  res.json({ received: true, processed: parsed.events.length, ignored: parsed.ignoredCount });
});

app.listen(port, () => {
  console.log(`Webhook proxy listening on http://127.0.0.1:${port}`);
  console.log(`Stripe webhook: POST http://127.0.0.1:${port}/webhook/stripe`);
  console.log(`Helius webhook: POST http://127.0.0.1:${port}/webhook/helius`);
  console.log(`SSE: GET http://127.0.0.1:${port}/stream`);
  console.log(`Print ack: POST http://127.0.0.1:${port}/print-ack`);
  console.log(`Database: ${databaseUrl}`);
});
