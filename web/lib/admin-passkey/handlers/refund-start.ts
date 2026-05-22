import { NextResponse } from "next/server";
import { persistActionChallenge } from "@/lib/admin-passkey/challenges";
import { jsonError } from "@/lib/admin-passkey/http";
import { hashRefundPayload } from "@/lib/admin-passkey/payload-hash";
import type { ParsedStaffRefundPayload } from "@/lib/admin-passkey/refund-payload";
import { generateActionAuthenticationOptions } from "@/lib/admin-passkey/webauthn";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import {
  countAdminPasskeys,
  deleteExpiredPasskeyChallenges,
} from "@/lib/infrastructure/turso/webhook-db";

export async function handleStaffAdminRefundStartRequest(
  body: ParsedStaffRefundPayload,
): Promise<Response> {
  const db = await getWebhookDb();
  await deleteExpiredPasskeyChallenges(db);

  const passkeyCount = await countAdminPasskeys(db);
  if (passkeyCount === 0) {
    return jsonError("no_admin_passkey", 503);
  }

  const payloadHash = hashRefundPayload(body);
  const { options, challenge } = await generateActionAuthenticationOptions(db);

  await persistActionChallenge(db, {
    challenge,
    actionName: "refund",
    payloadHash,
  });

  return NextResponse.json({ options });
}
