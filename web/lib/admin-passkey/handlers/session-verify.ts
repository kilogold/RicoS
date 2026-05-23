import { NextResponse } from "next/server";
import { challengeFromClientDataJSON } from "@/lib/admin-passkey/challenge-from-assertion";
import {
  adminSessionSetCookieHeader,
  cookieShouldBeSecure,
  signAdminCookie,
} from "@/lib/admin-passkey/admin-cookie";
import { expectedOrigin, SESSION_PAYLOAD_HASH } from "@/lib/admin-passkey/config";
import { jsonError } from "@/lib/admin-passkey/http";
import type { ParsedSessionVerifyBody } from "@/lib/admin-passkey/session-verify-payload";
import { verifyActionAuthentication } from "@/lib/admin-passkey/webauthn";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import {
  deleteExpiredPasskeyChallenges,
  updatePasskeyCounter,
} from "@/lib/infrastructure/turso/webhook-db";

export async function handleStaffAdminSessionVerifyRequest(
  req: Request,
  body: ParsedSessionVerifyBody,
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

  const db = await getWebhookDb();
  await deleteExpiredPasskeyChallenges(db);

  const verified = await verifyActionAuthentication({
    client: db,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    response: body.authenticationResponse,
    expectedPayloadHash: SESSION_PAYLOAD_HASH,
    expectedActionName: "session",
  });

  if (!verified.ok) {
    const status =
      verified.error === "challenge_not_found" || verified.error === "challenge_expired"
        ? 401
        : 403;
    return jsonError(verified.error, status);
  }

  await updatePasskeyCounter(db, verified.passkey.credentialId, verified.newCounter);

  const cookieValue = signAdminCookie(verified.passkey.credentialId);
  if (!cookieValue) {
    return jsonError("server_misconfigured", 503);
  }

  const setCookie = adminSessionSetCookieHeader(cookieValue, cookieShouldBeSecure(req));

  return NextResponse.json(
    { ok: true, credentialId: verified.passkey.credentialId },
    { headers: { "Set-Cookie": setCookie } },
  );
}
