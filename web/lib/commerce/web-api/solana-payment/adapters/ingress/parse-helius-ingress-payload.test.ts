/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { CART_B64_KEY, CART_CODEC_ID_V1, CART_CODEC_KEY } from "@ricos/shared";
import { getBase58Decoder } from "@solana/kit";
import { getTransferInstructionDataEncoder, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { parseHeliusIngressPayload, type HeliusIngressConfig } from "./parse-helius-ingress-payload";
import solflareTransfer from "./fixtures/solflare-transfer-devnet.json";

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
}) {
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
  test("parses the confirmed Solflare devnet Transfer payment for order 2im2A4", () => {
    const result = parseHeliusIngressPayload({
      headers: { "x-helius-auth": "test-secret" },
      config,
      body: [solflareTransfer],
    });

    expect(result).toEqual({
      kind: "ok",
      ignoredCount: 0,
      ignoredDetails: [],
      events: [
        {
          paymentIngressEventId:
            "evt_helius_2QZhnuLAzqVw2LHavqGExNvZNx1SgL1U6MsAC9nLL6e7E8EBAVrxtAeJmiXy2LVURQ1HjWn6N5j163VJnxJpPYQo",
          orderReferenceCandidates: ["2im2A4NiydVdBa46rmF7oRp2HFUkKMGZNsVCStSixt9c"],
          grandTotalCents: 673,
          currency: "usdc",
          metadata: {
            [CART_CODEC_KEY]: CART_CODEC_ID_V1,
            [CART_B64_KEY]: "ATQBZQEB",
          },
        },
      ],
    });
  });

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

  for (const instruction of ["Transfer", "TransferChecked"] as const) {
    function candidate() {
      return instruction === "Transfer" ? structuredClone(solflareTransfer) : rawSolanaPayCandidate();
    }

    for (const program of [TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS]) {
      test(`parses ${instruction} for token program ${program}`, () => {
        const body = candidate();
        const transfer = body.transaction.message.instructions[3];
        body.transaction.message.accountKeys[transfer.programIdIndex] = program;
        const result = parseHeliusIngressPayload({
          headers: { "x-helius-auth": "test-secret" }, config, body: [body],
        });

        expect(result.kind).toBe("ok");
        if (result.kind !== "ok") return;
        expect(result.ignoredCount).toBe(0);
        expect(result.events).toHaveLength(1);
        expect(result.events[0].grandTotalCents).toBe(instruction === "Transfer" ? 673 : 399);
      });
    }

    test(`ignores ${instruction} without reference accounts`, () => {
      const body = candidate();
      const transfer = body.transaction.message.instructions[3];
      transfer.accounts = transfer.accounts.slice(0, instruction === "Transfer" ? 3 : 4);
      const result = parseHeliusIngressPayload({
        headers: { "x-helius-auth": "test-secret" }, config, body: [body],
      });
      expect(result).toMatchObject({
        kind: "ok", events: [], ignoredCount: 1,
        ignoredDetails: [{ reason: "missing_solana_pay_order_reference" }],
      });
    });

    for (const field of ["mint", "owner"] as const) {
      test(`rejects ${instruction} with a different destination ${field}`, () => {
        const body = candidate();
        for (const balance of [...body.meta.preTokenBalances, ...body.meta.postTokenBalances]) {
          if (balance.accountIndex === 2) balance[field] = extraReference;
        }
        const result = parseHeliusIngressPayload({
          headers: { "x-helius-auth": "test-secret" }, config, body: [body],
        });
        expect(result).toMatchObject({
          kind: "ok", events: [], ignoredCount: 1,
          ignoredDetails: [{ reason: "mint_or_recipient_mismatch" }],
        });
      });
    }

    test(`rejects ${instruction} without destination token balances`, () => {
      const body = candidate();
      body.meta.preTokenBalances = body.meta.preTokenBalances.filter((balance) => balance.accountIndex !== 2);
      body.meta.postTokenBalances = [];
      const result = parseHeliusIngressPayload({
        headers: { "x-helius-auth": "test-secret" }, config, body: [body],
      });
      expect(result).toMatchObject({
        kind: "ok", events: [], ignoredCount: 1,
        ignoredDetails: [{ reason: "mint_or_recipient_mismatch" }],
      });
    });

    test(`rejects ${instruction} when token balances have non-USDC decimals`, () => {
      const body = candidate();
      for (const balance of [...body.meta.preTokenBalances, ...body.meta.postTokenBalances]) {
        balance.uiTokenAmount.decimals = 9;
      }
      const result = parseHeliusIngressPayload({
        headers: { "x-helius-auth": "test-secret" }, config, body: [body],
      });
      expect(result).toMatchObject({
        kind: "ok", events: [], ignoredCount: 1,
        ignoredDetails: [{ reason: "invalid_transfer_amount" }],
      });
    });
  }

  test("collects all remaining Transfer accounts starting after authority", () => {
    const body = structuredClone(solflareTransfer);
    body.transaction.message.instructions[3].accounts = [1, 2, 0, 0, 5];
    const result = parseHeliusIngressPayload({
      headers: { "x-helius-auth": "test-secret" }, config, body: [body],
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.events[0]?.orderReferenceCandidates).toEqual([
      "ExpHx8YCgNTQHf58xCuErXQTCFpmLJ3qdACh9t9txSwT",
      "2im2A4NiydVdBa46rmF7oRp2HFUkKMGZNsVCStSixt9c",
    ]);
  });

  test.each([0n, 6_730_001n])("rejects Transfer amount %s outside positive whole cents", (amount) => {
    const body = structuredClone(solflareTransfer);
    body.transaction.message.instructions[3].data = getBase58Decoder().decode(
      getTransferInstructionDataEncoder().encode({ amount }),
    );
    const result = parseHeliusIngressPayload({
      headers: { "x-helius-auth": "test-secret" }, config, body: [body],
    });
    expect(result).toMatchObject({
      kind: "ok", events: [], ignoredCount: 1,
      ignoredDetails: [{ reason: "invalid_transfer_amount" }],
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
