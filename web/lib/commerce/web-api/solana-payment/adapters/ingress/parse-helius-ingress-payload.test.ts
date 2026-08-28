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
const extraReference = "2nT8kNX7YvTBMekVWKqpRdDKQ7z9r8FVq4VNSS3bH4Qo";
const feePayer = "9vd5MkFDviku42mFPrcnLyznVMXfRHQ6Ze5EMjcHcPNJ";
const signature =
  "5STBAon61eFZzjSdZf7kQ2zwGJYYWjFHow61YWHnmKkwuuxCxBw1iUr4ir3DFwGeydfsu1j3obxQsZbJ28QexV7v";
const memo = "AQQBEwEBAQE";

function rawSolanaPayCandidate(params?: {
  err?: unknown;
  transferAccounts?: number[];
  accountKeys?: string[];
}): Record<string, unknown> {
  const transferAccounts = params?.transferAccounts ?? [1, 4, 2, 0, 3];
  const accountKeys = params?.accountKeys ?? [
    feePayer,
    sourceTokenAccount,
    destinationTokenAccount,
    orderReference,
    config.expectedUsdcMint,
    "ComputeBudget111111111111111111111111111111",
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  ];
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
        accountKeys,
        addressTableLookups: null,
        header: {
          numReadonlySignedAccounts: 0,
          numReadonlyUnsignedAccounts: accountKeys.length - 3,
          numRequiredSignatures: 1,
        },
        instructions: [
          { accounts: [], data: "3qYtvzaABqpT", programIdIndex: accountKeys.length - 3 },
          { accounts: [], data: "KqoHBD", programIdIndex: accountKeys.length - 3 },
          { accounts: [], data: "HCSAtjXz9PM9wqE", programIdIndex: accountKeys.length - 2 },
          {
            accounts: transferAccounts,
            data: "jAnGYWKPAzhvm",
            programIdIndex: accountKeys.length - 1,
          },
        ],
        recentBlockhash: "3NRncb7FJuDruQjMDxnHvJBQkvkHa7KSUBqBsxG21roZ",
      },
      signatures: [signature],
    },
  };
}

describe("parseHeliusIngressPayload", () => {
  test("parses a Raw Solana Pay TransferChecked webhook with reference candidates", () => {
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
          paymentIngressEventId: `evt_helius_${signature}`,
          orderReferenceCandidates: [orderReference],
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

  test("includes all remaining TransferChecked accounts as reference candidates", () => {
    // 6-account wallet shape: source, mint, dest, authority, feePayer, reference
    const result = parseHeliusIngressPayload({
      headers: { "x-helius-auth": "test-secret" },
      config,
      body: [rawSolanaPayCandidate({ transferAccounts: [1, 4, 2, 0, 0, 3] })],
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.events[0]?.orderReferenceCandidates).toEqual([feePayer, orderReference]);
  });

  test("emits both remaining accounts when two references are present", () => {
    const accountKeys = [
      feePayer,
      sourceTokenAccount,
      destinationTokenAccount,
      orderReference,
      extraReference,
      config.expectedUsdcMint,
      "ComputeBudget111111111111111111111111111111",
      "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    ];
    const result = parseHeliusIngressPayload({
      headers: { "x-helius-auth": "test-secret" },
      config,
      body: [
        rawSolanaPayCandidate({
          accountKeys,
          // source, mint, dest, authority, ref1, ref2
          transferAccounts: [1, 5, 2, 0, 3, 4],
        }),
      ],
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.events[0]?.orderReferenceCandidates).toEqual([orderReference, extraReference]);
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

  test("ignores TransferChecked without remaining reference accounts", () => {
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
