import { challengeFromClientDataJSON } from "@/lib/admin-passkey/challenge-from-assertion";
import { expectedOrigin } from "@/lib/admin-passkey/config";
import { jsonError } from "@/lib/admin-passkey/http";
import { hashRefundPayload } from "@/lib/admin-passkey/payload-hash";
import type { ParsedStaffRefundVerifyBody } from "@/lib/admin-passkey/refund-verify-payload";
import { jsonResponseForStaffRefundResult } from "@/lib/admin-passkey/staff-refund-response";
import { verifyActionAuthentication } from "@/lib/admin-passkey/webauthn";
import { staffRefundOrder } from "@/lib/commerce/web-api/staff-order-management/use-cases/staff-refund-order";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import {
  deleteExpiredPasskeyChallenges,
  updatePasskeyCounter,
} from "@/lib/infrastructure/turso/webhook-db";

export async function handleStaffAdminRefundVerifyAndRunRequest(
  req: Request,
  body: ParsedStaffRefundVerifyBody,
): Promise<Response> {
  const origin = expectedOrigin(req);
  if (!origin) {
    return jsonError("invalid_origin", 403);
  }

  const challenge = challengeFromClientDataJSON(
    body.authenticationResponse.response.clientDataJSON,
  );
  if (!challenge) {
    return jsonError("invalid_challenge", 400);
  }

  const payloadHash = hashRefundPayload(body.refund);
  const db = await getWebhookDb();
  await deleteExpiredPasskeyChallenges(db);

  const verified = await verifyActionAuthentication({
    client: db,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    response: body.authenticationResponse,
    expectedPayloadHash: payloadHash,
    expectedActionName: "refund",
  });

  if (!verified.ok) {
    const status =
      verified.error === "challenge_not_found" || verified.error === "challenge_expired"
        ? 401
        : 403;
    return jsonError(verified.error, status);
  }

  await updatePasskeyCounter(db, verified.passkey.credentialId, verified.newCounter);

  const result = await staffRefundOrder(db, body.refund);
  return jsonResponseForStaffRefundResult(result);
}
