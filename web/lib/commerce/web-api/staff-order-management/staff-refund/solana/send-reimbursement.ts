import { createTransfer } from "@solana/pay";
import { address } from "@solana/kit";
import { getHeliusIngressConfig } from "@/lib/commerce/web-api/solana-payment/config";
import { getMerchantRefundSigner } from "@/lib/commerce/web-api/staff-order-management/staff-refund/solana/merchant-signer";
import { getSolanaKitRpc, sendSignedInstructions } from "@/lib/infrastructure/helius/solana-kit-rpc";

export async function sendUsdcReimbursement(params: {
  payerAddress: string;
  amountCents: number;
  orderReference: string;
}): Promise<
  | { ok: true; transactionSignature: string }
  | { ok: false; code: "server_misconfigured" | "solana_refund_failed"; detail?: string }
> {
  const merchant = await getMerchantRefundSigner();
  if (!merchant.ok) {
    return { ok: false, code: merchant.code, detail: merchant.detail };
  }

  const { expectedUsdcMint } = getHeliusIngressConfig();
  const mint = address(expectedUsdcMint);
  const payer = address(params.payerAddress);
  const reference = address(params.orderReference);
  const amount = params.amountCents / 100;

  try {
    const rpc = getSolanaKitRpc();
    const instructions = await createTransfer(rpc, merchant.signer, {
      recipient: payer,
      amount,
      splToken: mint,
      reference,
    });
    const transactionSignature = await sendSignedInstructions({
      feePayer: merchant.signer,
      instructions,
    });
    return { ok: true, transactionSignature };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("solana staff refund send failed:", message);
    return { ok: false, code: "solana_refund_failed", detail: message };
  }
}
