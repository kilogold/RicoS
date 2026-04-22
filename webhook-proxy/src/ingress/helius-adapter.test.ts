import { describe, expect, test } from "bun:test";
import fixtureValid from "./fixtures/helius-solana-pay-valid.json";
import { parseHeliusIngressPayload } from "./helius-adapter.js";

const baseConfig = {
  authHeaderName: "x-helius-auth",
  authHeaderValue: "topsecret",
  expectedUsdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  expectedRecipient: "EEHj6a2oScEN2nKT7rN9n2UKT2jLbGQtJnNK5cC5MDJb",
} as const;

describe("parseHeliusIngressPayload", () => {
  test("maps a valid Solana Pay webhook payload", () => {
    const result = parseHeliusIngressPayload({
      body: fixtureValid,
      headers: { "x-helius-auth": "topsecret" },
      config: baseConfig,
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.events).toHaveLength(1);
    expect(result.events[0].ingressEventId.startsWith("evt_helius_")).toBe(true);
    expect(result.events[0].amountCents).toBe(725);
    expect(result.events[0].currency).toBe("usdc");
    expect(result.events[0].metadata.cart_b64).toBe("AQEBGgEC");
  });

  test("decodes memo from memo program instruction base58 data", () => {
    const result = parseHeliusIngressPayload({
      body: {
        signature: "sig_memo_from_instruction",
        instructions: [
          {
            programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
            data: "3UZhrTu9bJ",
          },
        ],
        tokenTransfers: [
          {
            mint: baseConfig.expectedUsdcMint,
            toUserAccount: baseConfig.expectedRecipient,
            tokenAmount: 3.99,
          },
        ],
      },
      headers: { "x-helius-auth": "topsecret" },
      config: baseConfig,
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.events[0].metadata.cart_b64).toBe("AQEBEQE");
  });

  test("extracts memo from transaction logs when available", () => {
    const result = parseHeliusIngressPayload({
      body: {
        signature: "sig_memo_from_logs",
        logMessages: ['Program log: Memo (len 7): "AQEBEQE"'],
        tokenTransfers: [
          {
            mint: baseConfig.expectedUsdcMint,
            toUserAccount: baseConfig.expectedRecipient,
            tokenAmount: 1.25,
          },
        ],
      },
      headers: { "x-helius-auth": "topsecret" },
      config: baseConfig,
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.events[0].metadata.cart_b64).toBe("AQEBEQE");
  });

  test("ignores non-Solana-Pay transactions", () => {
    const result = parseHeliusIngressPayload({
      body: { signature: "sig_no_solpay_fields" },
      headers: { "x-helius-auth": "topsecret" },
      config: baseConfig,
    });
    expect(result).toEqual({ kind: "ok", events: [], ignoredCount: 1 });
  });

  test("rejects Solana Pay candidate missing memo", () => {
    const result = parseHeliusIngressPayload({
      body: {
        signature: "sig_missing_memo",
        tokenTransfers: [{ mint: baseConfig.expectedUsdcMint, toUserAccount: baseConfig.expectedRecipient }],
      },
      headers: { "x-helius-auth": "topsecret" },
      config: baseConfig,
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(400);
  });

  test("rejects wrong mint/recipient", () => {
    const result = parseHeliusIngressPayload({
      body: {
        signature: "sig_wrong_mint",
        memo: "AQEBGgEC",
        tokenTransfers: [{ mint: "wrong-mint", toUserAccount: baseConfig.expectedRecipient, tokenAmount: 1 }],
      },
      headers: { "x-helius-auth": "topsecret" },
      config: baseConfig,
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(400);
  });
});
