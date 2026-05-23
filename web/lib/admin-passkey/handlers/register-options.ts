import { NextResponse } from "next/server";
import { challengeFromClientDataJSON } from "@/lib/admin-passkey/challenge-from-assertion";
import { persistRegisterChallenge } from "@/lib/admin-passkey/challenges";
import { expectedOrigin } from "@/lib/admin-passkey/config";
import { jsonError } from "@/lib/admin-passkey/http";
import { passkeyLimitResponse } from "@/lib/admin-passkey/passkey-limit-guard";
import type { ParsedRegisterOptionsBody } from "@/lib/admin-passkey/register-options-payload";
import {
  isAdminSetupConfigured,
  verifyAdminSetupSecret,
} from "@/lib/admin-passkey/verify-setup-secret";
import {
  generatePasskeyRegistrationOptions,
  generateRegisterAuthenticationOptions,
  verifyRegisterGateAuthentication,
} from "@/lib/admin-passkey/webauthn";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import {
  countAdminPasskeys,
  deleteExpiredPasskeyChallenges,
  updatePasskeyCounter,
} from "@/lib/infrastructure/turso/webhook-db";

export async function handleAdminPasskeyRegisterOptionsRequest(
  req: Request,
  body: ParsedRegisterOptionsBody,
): Promise<Response> {
  const origin = expectedOrigin(req);
  if (!origin) {
    return jsonError("invalid_origin", 403);
  }

  const db = await getWebhookDb();
  await deleteExpiredPasskeyChallenges(db);
  const passkeyCount = await countAdminPasskeys(db);

  const limitBlocked = passkeyLimitResponse(passkeyCount);
  if (limitBlocked) return limitBlocked;

  const setupSecret = body.setupSecret;

  if (setupSecret && passkeyCount > 0) {
    return jsonError("bootstrap_not_allowed", 403);
  }

  const approval = body.approval;
  if (approval !== undefined) {
    if (passkeyCount === 0) {
      return jsonError("bootstrap_required", 400);
    }
    const challenge = approval.response?.clientDataJSON
      ? challengeFromClientDataJSON(approval.response.clientDataJSON)
      : null;
    if (!challenge) {
      return jsonError("invalid_challenge", 400);
    }

    const verified = await verifyRegisterGateAuthentication({
      client: db,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      response: approval,
    });
    if (!verified.ok) {
      return jsonError(verified.error, 403);
    }
    await updatePasskeyCounter(db, verified.passkey.credentialId, verified.newCounter);

    const { options, challenge: regChallenge } = await generatePasskeyRegistrationOptions();
    await persistRegisterChallenge(db, regChallenge);
    return NextResponse.json({ step: "register", options });
  }

  if (passkeyCount === 0) {
    if (!isAdminSetupConfigured()) {
      return jsonError("setup_not_configured", 503);
    }
    if (!verifyAdminSetupSecret(setupSecret)) {
      return jsonError("unauthorized", 401);
    }
    const { options, challenge } = await generatePasskeyRegistrationOptions();
    await persistRegisterChallenge(db, challenge);
    return NextResponse.json({ step: "register", options });
  }

  const { options, challenge } = await generateRegisterAuthenticationOptions(db);
  await persistRegisterChallenge(db, challenge);
  return NextResponse.json({ step: "authenticate", options });
}
