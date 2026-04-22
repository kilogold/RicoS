import Stripe from "stripe";
import type { NormalizedIngressEvent } from "./types";

export type StripeIngressParseResult =
  | { kind: "error"; status: number; message: string }
  | { kind: "ignore" }
  | { kind: "event"; event: NormalizedIngressEvent };

export async function parseStripeIngressEvent(params: {
  rawBody: string;
  signature: string | undefined;
  stripe: Stripe;
  webhookSecret: string;
}): Promise<StripeIngressParseResult> {
  const { rawBody, signature, stripe, webhookSecret } = params;
  if (!signature) {
    return { kind: "error", status: 400, message: "Missing stripe-signature" };
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "error", status: 400, message: `Webhook Error: ${message}` };
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    console.error("Payment failed:", pi.id, pi.last_payment_error?.message);
    return { kind: "ignore" };
  }

  if (event.type !== "payment_intent.succeeded") {
    return { kind: "ignore" };
  }

  const pi = event.data.object as Stripe.PaymentIntent;
  return {
    kind: "event",
    event: {
      provider: "stripe",
      ingressEventId: event.id,
      paymentReferenceId: pi.id,
      amountCents: Number(pi.amount),
      currency: pi.currency,
      metadata: pi.metadata,
    },
  };
}
