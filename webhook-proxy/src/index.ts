import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Response } from "express";
import Stripe from "stripe";
import { parseKitchenLinesFromStripeMetadata } from "@ricos/shared";
import {
  defaultDatabaseUrl,
  deletePending,
  insertPendingIfNew,
  listPending,
  migrate,
  type KitchenOrderPayload,
  openDb,
} from "./db.js";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const webhookProxyPortRaw = process.env.WEBHOOK_PROXY_PORT?.trim();
const printAckSecret = process.env.PRINT_ACK_SECRET?.trim();
const databaseUrl = process.env.WEBHOOK_PROXY_DATABASE_URL?.trim() || defaultDatabaseUrl();

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

const port = Number(webhookProxyPortRaw);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error("WEBHOOK_PROXY_PORT must be a valid TCP port (1-65535)");
  process.exit(1);
}

ensureParentDirForFileUrl(databaseUrl);
const db = openDb(databaseUrl);
await migrate(db);

const stripe = new Stripe(stripeSecret);
const app = express();

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

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig || typeof sig !== "string") {
      res.status(400).send("Missing stripe-signature");
      return;
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(req.body, sig, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Webhook signature verification failed:", message);
      res.status(400).send(`Webhook Error: ${message}`);
      return;
    }

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const lines = parseKitchenLinesFromStripeMetadata(pi.metadata);
      const payload: KitchenOrderPayload = {
        stripeEventId: event.id,
        paymentIntentId: pi.id,
        amountCents: Number(pi.amount),
        currency: pi.currency,
        lines,
      };
      try {
        const inserted = await insertPendingIfNew(db, payload);
        if (inserted) {
          try {
            broadcastOrderPaid(payload);
          } catch (broadcastErr) {
            console.error("SSE broadcast failed (order is persisted):", broadcastErr);
          }
        }
      } catch (err) {
        console.error("kitchen_orders insert failed:", err);
        res.status(500).json({ error: "persist_failed" });
        return;
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      console.error("Payment failed:", pi.id, pi.last_payment_error?.message);
    }

    res.json({ received: true });
  },
);

app.listen(port, () => {
  console.log(`Webhook proxy listening on http://127.0.0.1:${port}`);
  console.log(`Webhook: POST http://127.0.0.1:${port}/webhook`);
  console.log(`SSE: GET http://127.0.0.1:${port}/stream`);
  console.log(`Print ack: POST http://127.0.0.1:${port}/print-ack`);
  console.log(`Database: ${databaseUrl}`);
});
