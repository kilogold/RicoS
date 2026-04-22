import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import fixtureSucceeded from "./fixtures/stripe-payment-intent-succeeded.json";
import { parseStripeIngressEvent } from "./stripe-adapter.js";

function fakeStripeReturning(event: unknown): Stripe {
  return {
    webhooks: {
      constructEventAsync: async () => event as Stripe.Event,
    },
  } as unknown as Stripe;
}

describe("parseStripeIngressEvent", () => {
  test("rejects missing signature", async () => {
    const result = await parseStripeIngressEvent({
      body: Buffer.from("{}"),
      signature: undefined,
      stripe: fakeStripeReturning(fixtureSucceeded),
      webhookSecret: "whsec_test",
    });
    expect(result).toEqual({
      kind: "error",
      status: 400,
      message: "Missing stripe-signature",
    });
  });

  test("maps payment_intent.succeeded into normalized event", async () => {
    const result = await parseStripeIngressEvent({
      body: Buffer.from("{}"),
      signature: "t=1,v1=sig",
      stripe: fakeStripeReturning(fixtureSucceeded),
      webhookSecret: "whsec_test",
    });
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return;
    expect(result.event.ingressEventId).toBe("evt_1RRicosExample");
    expect(result.event.paymentReferenceId).toBe("pi_3RicosExample");
    expect(result.event.amountCents).toBe(1337);
    expect(result.event.metadata.cart_b64).toBe("AQEBGgEC");
  });

  test("ignores non-succeeded event types", async () => {
    const failedEvent = {
      ...fixtureSucceeded,
      type: "payment_intent.payment_failed",
      data: {
        object: {
          ...fixtureSucceeded.data.object,
          last_payment_error: { message: "declined" },
        },
      },
    };
    const result = await parseStripeIngressEvent({
      body: Buffer.from("{}"),
      signature: "t=1,v1=sig",
      stripe: fakeStripeReturning(failedEvent),
      webhookSecret: "whsec_test",
    });
    expect(result).toEqual({ kind: "ignore" });
  });
});
