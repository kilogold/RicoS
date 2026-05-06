import Stripe from "stripe";
import { requiredEnv } from "@/lib/infrastructure/shared/env";

type StripeRuntimeState = {
  stripeClient: Stripe | null;
};

const state = globalThis as typeof globalThis & { __ricosStripeRuntime?: StripeRuntimeState };

if (!state.__ricosStripeRuntime) {
  state.__ricosStripeRuntime = {
    stripeClient: null,
  };
}

const runtime = state.__ricosStripeRuntime;

export function getStripeClient(): Stripe {
  if (runtime.stripeClient) return runtime.stripeClient;
  runtime.stripeClient = new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
  return runtime.stripeClient;
}

export function getStripeWebhookSecret(): string {
  return requiredEnv("STRIPE_WEBHOOK_SECRET");
}
