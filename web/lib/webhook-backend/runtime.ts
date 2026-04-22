import Stripe from "stripe";
import { MENU_VERSIONS } from "@ricos/shared";
import type { Client } from "@libsql/client";
import { migrate, openDb, seedMenuVersions, type KitchenOrderPayload } from "./db";
import type { HeliusIngressConfig } from "./ingress/helius-adapter";

type OrderPaidListener = (payload: KitchenOrderPayload) => void;

type RuntimeState = {
  dbPromise: Promise<Client> | null;
  stripe: Stripe | null;
  listeners: Set<OrderPaidListener>;
};

const state = globalThis as typeof globalThis & { __ricosWebhookRuntime?: RuntimeState };

if (!state.__ricosWebhookRuntime) {
  state.__ricosWebhookRuntime = {
    dbPromise: null,
    stripe: null,
    listeners: new Set<OrderPaidListener>(),
  };
}

const runtime = state.__ricosWebhookRuntime;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getPrintAckSecret(): string | undefined {
  return process.env.PRINT_ACK_SECRET?.trim();
}

export function getStripeWebhookSecret(): string {
  return requiredEnv("STRIPE_WEBHOOK_SECRET");
}

export function getStripeClient(): Stripe {
  if (runtime.stripe) return runtime.stripe;
  runtime.stripe = new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
  return runtime.stripe;
}

export function getHeliusIngressConfig(): HeliusIngressConfig {
  return {
    authHeaderName:
      process.env.HELIUS_WEBHOOK_AUTH_HEADER_NAME?.trim().toLowerCase() || "x-helius-auth",
    authHeaderValue: process.env.HELIUS_WEBHOOK_AUTH_HEADER_VALUE?.trim(),
    expectedUsdcMint: requiredEnv("HELIUS_USDC_MINT"),
    expectedRecipient: requiredEnv("HELIUS_MERCHANT_RECIPIENT"),
  };
}

export async function getWebhookDb(): Promise<Client> {
  if (runtime.dbPromise) return runtime.dbPromise;

  runtime.dbPromise = (async () => {
    const databaseUrl = requiredEnv("WEBHOOK_PROXY_DATABASE_URL");
    const databaseAuthToken = requiredEnv("WEBHOOK_PROXY_DATABASE_AUTH_TOKEN");
    if (!databaseUrl.startsWith("libsql://") && !databaseUrl.startsWith("https://")) {
      throw new Error(
        "WEBHOOK_PROXY_DATABASE_URL must be a Turso remote URL (libsql://... or https://...)",
      );
    }

    const db = openDb(databaseUrl, databaseAuthToken);
    await migrate(db);
    await seedMenuVersions(db, MENU_VERSIONS);
    return db;
  })();

  return runtime.dbPromise;
}

export function publishOrderPaid(payload: KitchenOrderPayload): void {
  for (const listener of runtime.listeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error("order.paid listener failed:", err);
    }
  }
}

export function subscribeOrderPaid(listener: OrderPaidListener): () => void {
  runtime.listeners.add(listener);
  return () => {
    runtime.listeners.delete(listener);
  };
}
