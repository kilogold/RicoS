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

describe("parseHeliusIngressPayload", () => {
  test("uses the Solana Pay reference from logged enhanced webhook instructions", () => {
    const memo = "AQQBEwEBAQE";
    const sourceTokenAccount = "9krqYuH38RuHgQKQvGVismCD6UwzScgCEP6CmzLH2KnK";
    const destinationTokenAccount = "FoA9SJA9ApdQXggzFjMGB5tRWX2YZ8oLyYwGcminepoG";
    const orderReference = "8aRWDWCFdJQMYujW1Z22LZbU7Mtki12QJSh6utd3kQ8Z";
    const feePayer = "9vd5MkFDviku42mFPrcnLyznVMXfRHQ6Ze5EMjcHcPNJ";
    const signature = "5STBAon61eFZzjSdZf7kQ2zwGJYYWjFHow61YWHnmKkwuuxCxBw1iUr4ir3DFwGeydfsu1j3obxQsZbJ28QexV7v";

    const result = parseHeliusIngressPayload({
      headers: { "x-helius-auth": "test-secret" },
      config,
      body: [
        {
          signature,
          description: `${feePayer} transferred 3.99 ${config.expectedUsdcMint} to ${config.expectedRecipient}.`,
          type: "TRANSFER",
          source: "SOLANA_PROGRAM_LIBRARY",
          feePayer,
          slot: 461782731,
          timestamp: 1778564083,
          instructions: [
            {
              accounts: [],
              data: "3qYtvzaABqpT",
              innerInstructions: [],
              programId: "ComputeBudget111111111111111111111111111111",
            },
            {
              accounts: [],
              data: "KqoHBD",
              innerInstructions: [],
              programId: "ComputeBudget111111111111111111111111111111",
            },
            {
              accounts: [],
              data: "HCSAtjXz9PM9wqE",
              innerInstructions: [],
              programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
            },
            {
              accounts: [
                sourceTokenAccount,
                config.expectedUsdcMint,
                destinationTokenAccount,
                feePayer,
                feePayer,
                orderReference,
              ],
              data: "jAnGYWKPAzhvm",
              innerInstructions: [],
              programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            },
          ],
          tokenTransfers: [
            {
              mint: config.expectedUsdcMint,
              fromUserAccount: feePayer,
              fromTokenAccount: sourceTokenAccount,
              toUserAccount: config.expectedRecipient,
              toTokenAccount: destinationTokenAccount,
              tokenAmount: 3.99,
            },
          ],
        },
      ],
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
          amountCents: 399,
          currency: "usdc",
          metadata: {
            [CART_CODEC_KEY]: CART_CODEC_ID_V1,
            [CART_B64_KEY]: memo,
          },
        },
      ],
    });
  });
});
