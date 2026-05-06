import { getCommerceDb } from "@/lib/infrastructure/turso/runtime";
import { ensureSolanaPaymentPollerStarted } from "./use-cases/solana-payment-poller";

export function ensureSolanaPaymentRuntimeStarted(): void {
  ensureSolanaPaymentPollerStarted(getCommerceDb);
}
