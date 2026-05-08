import { ensureSolanaPaymentPollerStarted } from "@/lib/commerce/web-api/solana-payment/use-cases/poller";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    ensureSolanaPaymentPollerStarted();
  }
}
