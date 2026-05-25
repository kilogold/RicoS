import { describe, expect, test } from "bun:test";
import { extractUsdcPayerFromHeliusTransaction } from "./extract-usdc-payer";

const mint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const recipient = "EEHj6a2oScEN2nKT7rN9n2UKT2jLbGQtJnNK5cC5MDJb";
const payer = "9vd5MkFDviku42mFPrcnLyznVMXfRHQ6Ze5EMjcHcPNJ";

describe("extractUsdcPayerFromHeliusTransaction", () => {
  test("returns fromUserAccount for matching mint and merchant recipient", () => {
    const result = extractUsdcPayerFromHeliusTransaction(
      {
        tokenTransfers: [
          {
            mint,
            fromUserAccount: payer,
            toUserAccount: recipient,
            tokenAmount: 3.99,
          },
        ],
      },
      { expectedMint: mint, expectedRecipient: recipient },
    );
    expect(result).toBe(payer);
  });

  test("returns null when recipient does not match", () => {
    const result = extractUsdcPayerFromHeliusTransaction(
      {
        tokenTransfers: [
          {
            mint,
            fromUserAccount: payer,
            toUserAccount: "OtherRecipient1111111111111111111111111111",
            tokenAmount: 1,
          },
        ],
      },
      { expectedMint: mint, expectedRecipient: recipient },
    );
    expect(result).toBeNull();
  });
});
