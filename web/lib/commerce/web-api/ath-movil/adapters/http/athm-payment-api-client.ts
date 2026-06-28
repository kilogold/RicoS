import {
  ATH_ECOMMERCE_STATUS,
  type AthAuthorizationResponse,
  type AthCreatePaymentRequest,
  type AthCreatePaymentResponse,
  type AthEcommerceStatus,
  type AthFindPaymentResponse,
} from "@/lib/commerce/web-api/ath-movil/domain/ath-orchestration-types";

const ATH_API_BASE_URL = "https://payments.athmovil.com/api/business-transaction/ecommerce";
const ATH_API_TIMEOUT_MS = 15_000;

type AthApiEnvelope = {
  status?: string;
  message?: string;
  errorcode?: string;
  data?: Record<string, unknown> | null;
};

export class AthPaymentApiError extends Error {
  constructor(
    message: string,
    readonly params: {
      code: "transport" | "bad_response" | "api_error";
      status?: number;
      errorCode?: string;
      phase: "payment" | "findPayment" | "authorization";
    },
  ) {
    super(message);
    this.name = "AthPaymentApiError";
  }
}

export async function createPayment(input: AthCreatePaymentRequest): Promise<AthCreatePaymentResponse> {
  const envelope = await postAthEnvelope({
    phase: "payment",
    path: "/payment",
    body: input,
  });
  const data = envelope.data ?? {};
  const ecommerceId = readString(data, ["ecommerceId"]);
  const authToken = readString(data, ["auth_token", "authToken"]);
  if (!ecommerceId || !authToken) {
    throw new AthPaymentApiError("ATH payment response missing ecommerceId/auth_token", {
      code: "bad_response",
      phase: "payment",
    });
  }
  return { ecommerceId, authToken };
}

export async function findPayment(params: {
  publicToken: string;
  ecommerceId: string;
}): Promise<AthFindPaymentResponse> {
  const envelope = await postAthEnvelope({
    phase: "findPayment",
    path: "/business/findPayment",
    body: {
      ecommerceId: params.ecommerceId,
      publicToken: params.publicToken,
    },
  });
  return toAthStatusResponse(envelope.data ?? {}, params.ecommerceId, "findPayment");
}

export async function authorizePayment(params: { authToken: string }): Promise<AthAuthorizationResponse> {
  const envelope = await postAthEnvelope({
    phase: "authorization",
    path: "/authorization",
    body: {},
    bearerToken: params.authToken,
  });
  return toAthStatusResponse(envelope.data ?? {}, undefined, "authorization");
}

function toAthStatusResponse(
  data: Record<string, unknown>,
  fallbackEcommerceId: string | undefined,
  phase: "findPayment" | "authorization",
): AthFindPaymentResponse | AthAuthorizationResponse {
  const ecommerceId = readString(data, ["ecommerceId"]) ?? fallbackEcommerceId;
  const statusRaw = readString(data, ["ecommerceStatus"]);
  const ecommerceStatus = normalizeAthStatus(statusRaw);
  if (!ecommerceId || !ecommerceStatus) {
    throw new AthPaymentApiError(`ATH ${phase} response missing ecommerceId/ecommerceStatus`, {
      code: "bad_response",
      phase,
    });
  }
  return {
    ecommerceId,
    ecommerceStatus,
    referenceNumber: readString(data, ["referenceNumber"]),
    metadata1: readString(data, ["metadata1"]),
    totalCents: readDollarsAsCents(data, ["total"]),
  };
}

async function postAthEnvelope(params: {
  phase: "payment" | "findPayment" | "authorization";
  path: string;
  body: unknown;
  bearerToken?: string;
}): Promise<AthApiEnvelope> {
  let res: Response;
  try {
    res = await fetch(`${ATH_API_BASE_URL}${params.path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(params.bearerToken ? { Authorization: `Bearer ${params.bearerToken}` } : {}),
      },
      body: JSON.stringify(params.body),
      signal: AbortSignal.timeout(ATH_API_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    throw new AthPaymentApiError(
      `ATH ${params.phase} transport error: ${err instanceof Error ? err.message : String(err)}`,
      { code: "transport", phase: params.phase },
    );
  }

  const json = (await res.json().catch(() => null)) as AthApiEnvelope | null;
  if (!res.ok || !json || !isRecord(json)) {
    throw new AthPaymentApiError(`ATH ${params.phase} failed with non-JSON or HTTP error`, {
      code: "bad_response",
      status: res.status,
      phase: params.phase,
    });
  }

  const statusValue = String(json.status ?? "").trim().toLowerCase();
  if (statusValue !== "success") {
    throw new AthPaymentApiError(
      `ATH ${params.phase} API error: ${json.message ?? "unknown ATH API error"}`,
      {
        code: "api_error",
        status: res.status,
        errorCode: typeof json.errorcode === "string" ? json.errorcode : undefined,
        phase: params.phase,
      },
    );
  }

  return json;
}

function normalizeAthStatus(value: string | undefined): AthEcommerceStatus | null {
  const status = value?.trim().toUpperCase();
  if (status === ATH_ECOMMERCE_STATUS.OPEN) return ATH_ECOMMERCE_STATUS.OPEN;
  if (status === ATH_ECOMMERCE_STATUS.CONFIRM) return ATH_ECOMMERCE_STATUS.CONFIRM;
  if (status === ATH_ECOMMERCE_STATUS.COMPLETED) return ATH_ECOMMERCE_STATUS.COMPLETED;
  if (status === ATH_ECOMMERCE_STATUS.CANCEL) return ATH_ECOMMERCE_STATUS.CANCEL;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readDollarsAsCents(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(n) || n <= 0) continue;
    return Math.round(n * 100);
  }
  return undefined;
}
