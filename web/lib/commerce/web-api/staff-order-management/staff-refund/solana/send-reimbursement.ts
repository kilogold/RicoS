import { address } from "@solana/kit";
import { getHeliusIngressConfig } from "@/lib/commerce/web-api/solana-payment/config";
import {
  centsToBaseUnits,
  createUsdcTransferInstruction,
} from "@/lib/commerce/web-api/staff-order-management/staff-refund/solana/create-usdc-transfer";
import { getMerchantRefundSigner } from "@/lib/commerce/web-api/staff-order-management/staff-refund/solana/merchant-signer";
import { getSolanaKitRpc, sendSignedInstructions } from "@/lib/infrastructure/helius/solana-kit-rpc";

/** USDC and USDC-devnet mints use 6 decimals. */
const USDC_MINT_DECIMALS = 6;

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
  const amountBaseUnits = centsToBaseUnits(params.amountCents, USDC_MINT_DECIMALS);

  try {
    const rpc = getSolanaKitRpc();
    const instruction = await createUsdcTransferInstruction({
      rpc,
      sender: merchant.signer,
      recipient: payer,
      mint,
      amountBaseUnits,
      reference,
    });
    const transactionSignature = await sendSignedInstructions({
      feePayer: merchant.signer,
      instructions: [instruction],
    });
    return { ok: true, transactionSignature };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("solana staff refund send failed:", message);
    return { ok: false, code: "solana_refund_failed", detail: message };
  }
}
