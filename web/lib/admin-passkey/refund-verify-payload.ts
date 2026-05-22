import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import {
  parseStaffRefundBody,
  type ParsedStaffRefundPayload,
} from "@/lib/admin-passkey/refund-payload";

export type ParsedStaffRefundVerifyBody = {
  refund: ParsedStaffRefundPayload;
  authenticationResponse: AuthenticationResponseJSON;
};

export function parseStaffRefundVerifyBody(body: {
  orderReference?: unknown;
  amountCents?: unknown;
  solanaRefundTransactionSignature?: unknown;
  idempotencyKey?: unknown;
  authenticationResponse?: unknown;
}):
  | { ok: true; payload: ParsedStaffRefundVerifyBody }
  | { ok: false; error: string } {
  const refund = parseStaffRefundBody(body);
  if (!refund.ok) {
    return refund;
  }

  const authenticationResponse = body.authenticationResponse;
  if (!authenticationResponse || typeof authenticationResponse !== "object") {
    return { ok: false, error: "invalid_authentication_response" };
  }

  return {
    ok: true,
    payload: {
      refund: refund.payload,
      authenticationResponse: authenticationResponse as AuthenticationResponseJSON,
    },
  };
}
