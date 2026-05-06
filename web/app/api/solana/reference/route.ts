import { handleRegisterSolanaReferencePost } from "@/lib/commerce/web-api/solana-payment";

export async function POST(req: Request) {
  return handleRegisterSolanaReferencePost(req);
}
