import express from "express";
import Stripe from "stripe";
import { getItemById } from "@ricos/shared";
import { formatTicket, printTicket } from "./print.js";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const port = Number(process.env.KITCHEN_RELAY_PORT ?? "4000");
const logFilePath = process.env.KITCHEN_PRINT_LOG;

if (!stripeSecret) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}
if (!webhookSecret) {
  console.error("Missing STRIPE_WEBHOOK_SECRET");
  process.exit(1);
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
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Webhook signature verification failed:", message);
      res.status(400).send(`Webhook Error: ${message}`);
      return;
    }

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const lines = parseLinesFromMetadata(pi.metadata);
      const text = formatTicket({
        paymentIntentId: pi.id,
        amountCents: pi.amount,
        currency: pi.currency,
        lines,
        printedAt: new Date(),
        logFilePath,
      });
      await printTicket(text, { logFilePath });
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      console.error("Payment failed:", pi.id, pi.last_payment_error?.message);
    }

    res.json({ received: true });
  },
);

function parseLinesFromMetadata(
  metadata: Stripe.Metadata,
): { id: string; quantity: number }[] {
  const countRaw = metadata.line_count;
  const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
  const lines: { id: string; quantity: number }[] = [];
  if (Number.isFinite(count) && count > 0) {
    for (let i = 0; i < count; i += 1) {
      const raw = metadata[`line_${i}`];
      if (!raw) continue;
      const [id, qtyStr] = raw.split(":");
      const quantity = Number.parseInt(qtyStr ?? "1", 10);
      if (id && Number.isFinite(quantity) && quantity > 0) {
        if (!getItemById(id)) {
          console.warn("Unknown menu id in metadata:", id);
        }
        lines.push({ id, quantity });
      }
    }
  }
  return lines;
}

app.listen(port, () => {
  console.log(`Kitchen relay listening on http://localhost:${port}`);
  console.log(`Webhook: POST http://localhost:${port}/webhook`);
});
