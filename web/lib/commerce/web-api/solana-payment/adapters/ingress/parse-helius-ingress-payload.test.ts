/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { CART_B64_KEY, CART_CODEC_ID_V1, CART_CODEC_KEY } from "@ricos/shared";
import { parseHeliusIngressPayload, type HeliusIngressConfig } from "./parse-helius-ingress-payload";

const config: HeliusIngressConfig = {
  authHeaderName: "x-helius-auth",
  authHeaderValue: "test-secret",
  expectedUsdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  expectedRecipient: "EEHj6a2oScEN2nKT7rN9n2UKT2jLbGQtJnNK5cC5MDJb",
};

const sourceTokenAccount = "9krqYuH38RuHgQKQvGVismCD6UwzScgCEP6CmzLH2KnK";
const destinationTokenAccount = "FoA9SJA9ApdQXggzFjMGB5tRWX2YZ8oLyYwGcminepoG";
const orderReference = "8aRWDWCFdJQMYujW1Z22LZbU7Mtki12QJSh6utd3kQ8Z";
const feePayer = "9vd5MkFDviku42mFPrcnLyznVMXfRHQ6Ze5EMjcHcPNJ";
const signature =
  "5STBAon61eFZzjSdZf7kQ2zwGJYYWjFHow61YWHnmKkwuuxCxBw1iUr4ir3DFwGeydfsu1j3obxQsZbJ28QexV7v";
const memo = "AQQBEwEBAQE";

function rawSolanaPayCandidate(params?: {
  err?: unknown;
  transferAccounts?: number[];
}): Record<string, unknown> {
  const transferAccounts = params?.transferAccounts ?? [1, 4, 2, 0, 3];
  return {
    blockTime: 1778564083,
    meta: {
      err: params?.err === undefined ? null : params.err,
      fee: 5000,
      innerInstructions: [],
      loadedAddresses: { readonly: [], writable: [] },
      logMessages: [
        "Program MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr invoke [1]",
        `Program log: Memo (len ${memo.length}): "${memo}"`,
        "Program MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr success",
      ],
      postTokenBalances: [
        {
          accountIndex: 2,
          mint: config.expectedUsdcMint,
          owner: config.expectedRecipient,
          uiTokenAmount: {
            amount: "3990000",
            decimals: 6,
            uiAmount: 3.99,
            uiAmountString: "3.99",
          },
        },
      ],
      preTokenBalances: [
        {
          accountIndex: 1,
          mint: config.expectedUsdcMint,
          owner: feePayer,
          uiTokenAmount: {
            amount: "3990000",
            decimals: 6,
            uiAmount: 3.99,
            uiAmountString: "3.99",
          },
        },
      ],
      rewards: [],
    },
    slot: 461782731,
    transaction: {
      message: {
        accountKeys: [
          feePayer,
          sourceTokenAccount,
          destinationTokenAccount,
          orderReference,
          config.expectedUsdcMint,
          "ComputeBudget111111111111111111111111111111",
          "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        ],
        addressTableLookups: null,
        header: {
          numReadonlySignedAccounts: 0,
          numReadonlyUnsignedAccounts: 5,
          numRequiredSignatures: 1,
        },
        instructions: [
          { accounts: [], data: "3qYtvzaABqpT", programIdIndex: 5 },
          { accounts: [], data: "KqoHBD", programIdIndex: 5 },
          { accounts: [], data: "HCSAtjXz9PM9wqE", programIdIndex: 6 },
          {
            accounts: transferAccounts,
            data: "jAnGYWKPAzhvm",
            programIdIndex: 7,
          },
        ],
        recentBlockhash: "3NRncb7FJuDruQjMDxnHvJBQkvkHa7KSUBqBsxG21roZ",
      },
      signatures: [signature],
    },
  };
}

describe("parseHeliusIngressPayload", () => {
  test("parses a Raw Solana Pay TransferChecked webhook into a normalized event", () => {
    const result = parseHeliusIngressPayload({
      headers: { "x-helius-auth": "test-secret" },
      config,
      body: [rawSolanaPayCandidate()],
    });

    expect(result).toEqual({
      kind: "ok",
      ignoredCount: 0,
      ignoredDetails: [],
      events: [
        {
          provider: "helius",
          paymentIngressEventId: `evt_helius_${signature}`,
          paymentReferenceId: orderReference,
          grandTotalCents: 399,
          currency: "usdc",
          metadata: {
            [CART_CODEC_KEY]: CART_CODEC_ID_V1,
            [CART_B64_KEY]: memo,
          },
        },
      ],
    });
  });

  test("uses the last extra TransferChecked account as the Solana Pay reference", () => {
    // 6-account wallet shape: source, mint, dest, authority, feePayer, reference
    const result = parseHeliusIngressPayload({
      headers: { "x-helius-auth": "test-secret" },
      config,
      body: [rawSolanaPayCandidate({ transferAccounts: [1, 4, 2, 0, 0, 3] })],
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.events[0]?.paymentReferenceId).toBe(orderReference);
  });

  test("ignores failed transactions", () => {
    const result = parseHeliusIngressPayload({
      headers: { "x-helius-auth": "test-secret" },
      config,
      body: [rawSolanaPayCandidate({ err: { InstructionError: [3, "Custom"] } })],
    });

    expect(result).toEqual({
      kind: "ok",
      events: [],
      ignoredCount: 1,
      ignoredDetails: [{ signature, reason: "failed_transaction" }],
    });
  });

  test("ignores TransferChecked without a Solana Pay reference account", () => {
    const result = parseHeliusIngressPayload({
      headers: { "x-helius-auth": "test-secret" },
      config,
      body: [rawSolanaPayCandidate({ transferAccounts: [1, 4, 2, 0] })],
    });

    expect(result).toEqual({
      kind: "ok",
      events: [],
      ignoredCount: 1,
      ignoredDetails: [{ signature, reason: "missing_solana_pay_order_reference" }],
    });
  });
});
