import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  getHeliusEnhancedApiBase,
  getHeliusRpcUrl,
  getHeliusSolanaCluster,
} from "./config";

describe("getHeliusSolanaCluster", () => {
  afterEach(() => {
    delete process.env.HELIUS_SOLANA_CLUSTER;
  });

  test("defaults to devnet when unset", () => {
    expect(getHeliusSolanaCluster()).toBe("devnet");
  });

  test("accepts mainnet-beta alias", () => {
    process.env.HELIUS_SOLANA_CLUSTER = "mainnet-beta";
    expect(getHeliusSolanaCluster()).toBe("mainnet");
  });

  test("accepts devnet explicitly", () => {
    process.env.HELIUS_SOLANA_CLUSTER = "devnet";
    expect(getHeliusSolanaCluster()).toBe("devnet");
  });
});

describe("getHeliusRpcUrl", () => {
  const originalApiKey = process.env.HELIUS_API_KEY;
  const originalCluster = process.env.HELIUS_SOLANA_CLUSTER;

  beforeEach(() => {
    process.env.HELIUS_API_KEY = "test-api-key";
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

  test("builds devnet Helius RPC URL with encoded api key", () => {
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
  afterEach(() => {
    delete process.env.HELIUS_SOLANA_CLUSTER;
  });

  test("maps devnet cluster to enhanced API host", () => {
    process.env.HELIUS_SOLANA_CLUSTER = "devnet";
    expect(getHeliusEnhancedApiBase()).toBe("https://api-devnet.helius-rpc.com");
  });

  test("maps mainnet cluster to enhanced API host", () => {
    process.env.HELIUS_SOLANA_CLUSTER = "mainnet";
    expect(getHeliusEnhancedApiBase()).toBe("https://api-mainnet.helius-rpc.com");
  });
});
