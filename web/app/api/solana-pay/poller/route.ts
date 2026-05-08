import {
  handleSolanaPollerPokeRequest,
  handleSolanaPollerStatusRequest,
} from "@/lib/commerce/web-api/solana-payment/adapters/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handleSolanaPollerStatusRequest();
}

export async function POST() {
  return handleSolanaPollerPokeRequest();
}
