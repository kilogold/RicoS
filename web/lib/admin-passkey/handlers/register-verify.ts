import { NextResponse } from "next/server";
import { challengeFromClientDataJSON } from "@/lib/admin-passkey/challenge-from-assertion";
import { expectedOrigin } from "@/lib/admin-passkey/config";
import { jsonError } from "@/lib/admin-passkey/http";
import type { ParsedRegisterVerifyBody } from "@/lib/admin-passkey/register-verify-payload";
import { verifyPasskeyRegistration } from "@/lib/admin-passkey/webauthn";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import {
  deleteExpiredPasskeyChallenges,
  getPasskeyByCredentialId,
  insertPasskey,
} from "@/lib/infrastructure/turso/webhook-db";

export async function handleAdminPasskeyRegisterVerifyRequest(
  req: Request,
  body: ParsedRegisterVerifyBody,
): Promise<Response> {
  const origin = expectedOrigin(req);
  if (!origin) {
    return jsonError("invalid_origin", 403);
  }

  const challenge = challengeFromClientDataJSON(
    body.registrationResponse.response.clientDataJSON,
  );
  if (!challenge) {
    return jsonError("invalid_challenge", 400);
  }

  const db = await getWebhookDb();
  await deleteExpiredPasskeyChallenges(db);

  const verified = await verifyPasskeyRegistration({
    client: db,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    response: body.registrationResponse,
  });

  if (!verified.ok) {
    return jsonError(verified.error, 403);
  }

  const existing = await getPasskeyByCredentialId(db, verified.credentialId);
  if (existing) {
    return jsonError("credential_already_registered", 409);
  }

  await insertPasskey(db, {
    credentialId: verified.credentialId,
    publicKey: verified.publicKey,
    counter: verified.counter,
    name: body.name,
  });

  return NextResponse.json({ registered: true, credentialId: verified.credentialId });
}
