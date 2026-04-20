import express from "express";
import Stripe from "stripe";
import { getItemById, normalizeSelections } from "@ricos/shared";
import { createFileIdempotencyStore, resolveIdempotencyStorePath } from "./idempotency.js";
import {
  appendDeadLetter,
  createConsolePrinterAdapter,
  createLpPrinterAdapter,
  formatTicket,
  printWithRetries,
  type PrinterAdapter,
} from "./print.js";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const port = Number(process.env.KITCHEN_RELAY_PORT ?? "4000");
const logFilePath = process.env.KITCHEN_PRINT_LOG;
const printerAdapterEnv = process.env.KITCHEN_PRINTER_ADAPTER;
const deadLetterPath = process.env.KITCHEN_PRINT_DEAD_LETTER?.trim() || undefined;
const idempotencyPath = resolveIdempotencyStorePath(process.env.KITCHEN_IDEMPOTENCY_STORE);

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const printMaxAttempts = parsePositiveInt(process.env.KITCHEN_PRINT_MAX_ATTEMPTS, 5);
const printRetryInitialDelayMs = parsePositiveInt(process.env.KITCHEN_PRINT_RETRY_INITIAL_DELAY_MS, 200);

if (!stripeSecret) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}
if (!webhookSecret) {
  console.error("Missing STRIPE_WEBHOOK_SECRET");
  process.exit(1);
}
if (!printerAdapterEnv || (printerAdapterEnv !== "lp" && printerAdapterEnv !== "console")) {
  console.error("KITCHEN_PRINTER_ADAPTER must be set to lp or console");
  process.exit(1);
}

function createPrinter(): PrinterAdapter {
  if (printerAdapterEnv === "console") {
    return createConsolePrinterAdapter({ logFilePath });
  }
  return createLpPrinterAdapter({
    destination: process.env.KITCHEN_PRINTER_NAME?.trim() || undefined,
    title: process.env.KITCHEN_PRINTER_TITLE?.trim() || undefined,
  });
}

const printer = createPrinter();
const idempotency = createFileIdempotencyStore(idempotencyPath);

/** Serialize payment_intent.succeeded handling to avoid duplicate prints under concurrency. */
let processingChain = Promise.resolve();

function enqueueSucceededWork(fn: () => Promise<void>): Promise<void> {
  const next = processingChain.then(() => fn());
  processingChain = next.catch(() => {});
  return next;
}

const stripe = new Stripe(stripeSecret);
const app = express();

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
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
      event = await stripe.webhooks.constructEventAsync(
        req.body,
        sig,
        webhookSecret,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Webhook signature verification failed:", message);
      res.status(400).send(`Webhook Error: ${message}`);
      return;
    }

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      try {
        await enqueueSucceededWork(async () => {
          if (await idempotency.isCommitted(event.id)) {
            return;
          }
          const lines = parseLinesFromMetadata(pi.metadata);
          const text = formatTicket({
            paymentIntentId: pi.id,
            amountCents: pi.amount,
            currency: pi.currency,
            lines,
            printedAt: new Date(),
          });
          try {
            await printWithRetries(printer, text, {
              maxAttempts: printMaxAttempts,
              initialDelayMs: printRetryInitialDelayMs,
            });
            await idempotency.markCommitted(event.id);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Print failed after retries:", message);
            if (deadLetterPath) {
              try {
                await appendDeadLetter(deadLetterPath, text, {
                  eventId: event.id,
                  message,
                });
              } catch (dlErr) {
                console.error("Dead-letter write failed:", dlErr);
              }
            }
          }
        });
      } catch (err) {
        console.error("payment_intent.succeeded handling error:", err);
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      console.error("Payment failed:", pi.id, pi.last_payment_error?.message);
    }

    res.json({ received: true });
  },
);

function parseLinesFromMetadata(
  metadata: Stripe.Metadata,
): { id: string; quantity: number; selections: Record<string, string[]> }[] {
  const countRaw = metadata.line_count;
  const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
  const lines: { id: string; quantity: number; selections: Record<string, string[]> }[] = [];
  if (Number.isFinite(count) && count > 0) {
    for (let i = 0; i < count; i += 1) {
      const raw = metadata[`line_${i}`];
      if (!raw) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.warn("Invalid line metadata JSON:", raw);
        continue;
      }
      const data = parsed as {
        i?: unknown;
        q?: unknown;
        s?: unknown;
      };
      const id = typeof data.i === "string" ? data.i : "";
      const quantity = typeof data.q === "number" ? data.q : Number.NaN;
      const selections =
        data.s && typeof data.s === "object"
          ? normalizeSelections(data.s as Record<string, string[]>)
          : {};
      if (id && Number.isFinite(quantity) && quantity > 0) {
        if (!getItemById(id)) {
          console.warn("Unknown menu id in metadata:", id);
        }
        lines.push({ id, quantity, selections });
      }
    }
  }
  return lines;
}

app.listen(port, () => {
  console.log(`Kitchen relay listening on http://localhost:${port}`);
  console.log(`Webhook: POST http://localhost:${port}/webhook`);
  console.log(`Printer adapter: ${printerAdapterEnv}`);
  console.log(`Idempotency store: ${idempotencyPath}`);
});
