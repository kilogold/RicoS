import {
  forwardJsonRpcToHelius,
  type JsonRpcRequest,
} from "@/lib/infrastructure/helius/solana-rpc";

/** Read-only RPC methods used by Solana Pay checkout (polling, confirmation, verification). */
export const ALLOWED_SOLANA_RPC_METHODS = new Set([
  "getSignaturesForAddress",
  "getSignatureStatuses",
  "getTransaction",
]);

export function isAllowedSolanaRpcMethod(method: unknown): method is string {
  return typeof method === "string" && ALLOWED_SOLANA_RPC_METHODS.has(method);
}

export function parseSolanaRpcProxyRequest(body: unknown): JsonRpcRequest | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.method !== "string" || candidate.method.length === 0) {
    return null;
  }
  return {
    jsonrpc: typeof candidate.jsonrpc === "string" ? candidate.jsonrpc : "2.0",
    id: candidate.id,
    method: candidate.method,
    params: candidate.params,
  };
}

export async function handleSolanaRpcProxyRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (Array.isArray(body)) {
    return Response.json({ error: "batch_not_supported" }, { status: 400 });
  }

  const request = parseSolanaRpcProxyRequest(body);
  if (!request) {
    return Response.json({ error: "invalid_json_rpc_request" }, { status: 400 });
  }

  if (!isAllowedSolanaRpcMethod(request.method)) {
    return Response.json({ error: "method_not_allowed" }, { status: 403 });
  }

  return forwardJsonRpcToHelius(request);
}
