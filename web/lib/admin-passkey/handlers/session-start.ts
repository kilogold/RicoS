import { NextResponse } from "next/server";
import { persistActionChallenge } from "@/lib/admin-passkey/challenges";
import { SESSION_PAYLOAD_HASH } from "@/lib/admin-passkey/config";
import { jsonError } from "@/lib/admin-passkey/http";
import { generateActionAuthenticationOptions } from "@/lib/admin-passkey/webauthn";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import {
  countAdminPasskeys,
  deleteExpiredPasskeyChallenges,
} from "@/lib/infrastructure/turso/webhook-db";

export async function handleStaffAdminSessionStartRequest(): Promise<Response> {
  const db = await getWebhookDb();
  await deleteExpiredPasskeyChallenges(db);

  const passkeyCount = await countAdminPasskeys(db);
  if (passkeyCount === 0) {
    return jsonError("no_admin_passkey", 503);
  }

  const { options, challenge } = await generateActionAuthenticationOptions(db);

  await persistActionChallenge(db, {
    challenge,
    actionName: "session",
    payloadHash: SESSION_PAYLOAD_HASH,
  });

  return NextResponse.json({ options });
}
