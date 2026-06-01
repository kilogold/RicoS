import { describe, expect, test } from "bun:test";

import {
  ALLOWED_SOLANA_RPC_METHODS,
  isAllowedSolanaRpcMethod,
  parseSolanaRpcProxyRequest,
} from "./solana-rpc-proxy";

describe("isAllowedSolanaRpcMethod", () => {
  test("allows checkout read-only methods", () => {
    for (const method of ALLOWED_SOLANA_RPC_METHODS) {
      expect(isAllowedSolanaRpcMethod(method)).toBe(true);
    }
  });

  test("rejects write and admin methods", () => {
    expect(isAllowedSolanaRpcMethod("sendTransaction")).toBe(false);
    expect(isAllowedSolanaRpcMethod("requestAirdrop")).toBe(false);
    expect(isAllowedSolanaRpcMethod("")).toBe(false);
    expect(isAllowedSolanaRpcMethod(null)).toBe(false);
  });
});

describe("parseSolanaRpcProxyRequest", () => {
  test("parses a valid single JSON-RPC request", () => {
    expect(
      parseSolanaRpcProxyRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: ["sig"],
      }),
    ).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: ["sig"],
    });
  });

  test("rejects batch arrays and missing method", () => {
    expect(parseSolanaRpcProxyRequest([{ method: "getTransaction" }])).toBeNull();
    expect(parseSolanaRpcProxyRequest({ id: 1 })).toBeNull();
    expect(parseSolanaRpcProxyRequest(null)).toBeNull();
  });
});
