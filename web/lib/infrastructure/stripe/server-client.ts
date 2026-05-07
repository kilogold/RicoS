import Stripe from "stripe";
import { requiredEnv } from "@/lib/shared/config/server-env";

type StripeRuntimeState = {
  stripe: Stripe | null;
};

const state = globalThis as typeof globalThis & {
  __ricosStripeRuntime?: StripeRuntimeState;
};

if (!state.__ricosStripeRuntime) {
  state.__ricosStripeRuntime = { stripe: null };
}

const runtime = state.__ricosStripeRuntime;

export function getStripeServerClient(): Stripe {
  if (runtime.stripe) return runtime.stripe;
  runtime.stripe = new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
  return runtime.stripe;
}
