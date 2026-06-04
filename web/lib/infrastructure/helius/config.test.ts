import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { getHeliusEnhancedApiBase, getHeliusRpcUrl } from "./config";

describe("getHeliusRpcUrl", () => {
  const originalApiKey = process.env.HELIUS_API_KEY;
  const originalCluster = process.env.HELIUS_SOLANA_CLUSTER;

  beforeEach(() => {
    process.env.HELIUS_API_KEY = "test-api-key";
    process.env.HELIUS_SOLANA_CLUSTER = "devnet";
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.HELIUS_API_KEY;
    } else {
      process.env.HELIUS_API_KEY = originalApiKey;
    }
    if (originalCluster === undefined) {
      delete process.env.HELIUS_SOLANA_CLUSTER;
    } else {
      process.env.HELIUS_SOLANA_CLUSTER = originalCluster;
    }
  });

  test("throws when cluster is missing", () => {
    delete process.env.HELIUS_SOLANA_CLUSTER;
    expect(() => getHeliusRpcUrl()).toThrow(
      "Missing required environment variable: HELIUS_SOLANA_CLUSTER",
    );
  });

  test("builds devnet Helius RPC URL", () => {
    process.env.HELIUS_SOLANA_CLUSTER = "devnet";
    expect(getHeliusRpcUrl()).toBe(
      "https://devnet.helius-rpc.com/?api-key=test-api-key",
    );
  });

  test("builds mainnet Helius RPC URL", () => {
    process.env.HELIUS_SOLANA_CLUSTER = "mainnet";
    expect(getHeliusRpcUrl()).toBe(
      "https://mainnet.helius-rpc.com/?api-key=test-api-key",
    );
  });
});

describe("getHeliusEnhancedApiBase", () => {
  const originalCluster = process.env.HELIUS_SOLANA_CLUSTER;

  afterEach(() => {
    if (originalCluster === undefined) {
      delete process.env.HELIUS_SOLANA_CLUSTER;
    } else {
      process.env.HELIUS_SOLANA_CLUSTER = originalCluster;
    }
  });

  test("throws when cluster is missing", () => {
    delete process.env.HELIUS_SOLANA_CLUSTER;
    expect(() => getHeliusEnhancedApiBase()).toThrow(
      "Missing required environment variable: HELIUS_SOLANA_CLUSTER",
    );
  });

  test("uses devnet enhanced API host", () => {
    process.env.HELIUS_SOLANA_CLUSTER = "devnet";
    expect(getHeliusEnhancedApiBase()).toBe("https://api-devnet.helius-rpc.com");
  });

  test("uses mainnet enhanced API host", () => {
    process.env.HELIUS_SOLANA_CLUSTER = "mainnet";
    expect(getHeliusEnhancedApiBase()).toBe("https://api-mainnet.helius-rpc.com");
  });
});
