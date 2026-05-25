import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const createTransferMock = mock(async () => [{ programAddress: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }]);
const sendSignedInstructionsMock = mock(async () => "refundSig111111111111111111111111111111111111111111111111111111111");

mock.module("@solana/pay", () => ({
  createTransfer: createTransferMock,
}));

mock.module(
  "@/lib/commerce/web-api/staff-order-management/staff-refund/solana/merchant-signer",
  () => ({
    getMerchantRefundSigner: async () => ({
      ok: true,
      signer: { address: "EEHj6a2oScEN2nKT7rN9n2UKT2jLbGQtJnNK5cC5MDJb" },
      recipient: "EEHj6a2oScEN2nKT7rN9n2UKT2jLbGQtJnNK5cC5MDJb",
    }),
  }),
);

mock.module("@/lib/infrastructure/helius/solana-kit-rpc", () => ({
  getSolanaKitRpc: () => ({}),
  sendSignedInstructions: sendSignedInstructionsMock,
}));

const originalMint = process.env.HELIUS_USDC_MINT;
const originalRecipient = process.env.HELIUS_MERCHANT_RECIPIENT;

describe("sendUsdcReimbursement", () => {
  beforeEach(() => {
    process.env.HELIUS_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
    process.env.HELIUS_MERCHANT_RECIPIENT = "EEHj6a2oScEN2nKT7rN9n2UKT2jLbGQtJnNK5cC5MDJb";
    createTransferMock.mockClear();
    sendSignedInstructionsMock.mockClear();
  });

  afterEach(() => {
    process.env.HELIUS_USDC_MINT = originalMint;
    process.env.HELIUS_MERCHANT_RECIPIENT = originalRecipient;
  });

  test("calls createTransfer with human amount and order reference", async () => {
    const { sendUsdcReimbursement } = await import("./send-reimbursement");
    const orderReference = "8aRWDWCFdJQMYujW1Z22LZbU7Mtki12QJSh6utd3kQ8Z";
    const payerAddress = "9vd5MkFDviku42mFPrcnLyznVMXfRHQ6Ze5EMjcHcPNJ";

    const result = await sendUsdcReimbursement({
      payerAddress,
      amountCents: 399,
      orderReference,
    });

    expect(result).toEqual({ ok: true, transactionSignature: "refundSig111111111111111111111111111111111111111111111111111111111" });
    expect(createTransferMock).toHaveBeenCalledTimes(1);
    const fields = createTransferMock.mock.calls[0]?.[2];
    expect(fields?.amount).toBe(3.99);
    expect(String(fields?.reference)).toBe(orderReference);
    expect(String(fields?.recipient)).toBe(payerAddress);
    expect(String(fields?.splToken)).toBe(process.env.HELIUS_USDC_MINT);
  });
});
