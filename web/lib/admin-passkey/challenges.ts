import type { Client } from "@libsql/client";
import {
  deletePasskeyChallenge,
  getPasskeyChallenge,
  insertPasskeyChallenge,
  type PasskeyChallengeRecord,
} from "@/lib/infrastructure/turso/webhook-db";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const CHALLENGE_TTL_MINUTES = 5;
const CHALLENGE_TTL_MS =
  CHALLENGE_TTL_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

export function challengeExpiresAt(now = Date.now()): number {
  return now + CHALLENGE_TTL_MS;
}

export async function persistRegisterChallenge(
  client: Client,
  challenge: string,
): Promise<void> {
  await insertPasskeyChallenge(client, {
    challenge,
    type: "register",
    expiresAt: challengeExpiresAt(),
  });
}

export async function persistActionChallenge(
  client: Client,
  params: {
    challenge: string;
    actionName: string;
    payloadHash: string;
  },
): Promise<void> {
  await insertPasskeyChallenge(client, {
    challenge: params.challenge,
    type: "action",
    actionName: params.actionName,
    payloadHash: params.payloadHash,
    expiresAt: challengeExpiresAt(),
  });
}

export type LoadedChallenge =
  | { ok: true; record: PasskeyChallengeRecord }
  | { ok: false; error: "challenge_not_found" | "challenge_expired" };

export async function loadChallenge(
  client: Client,
  challenge: string,
): Promise<LoadedChallenge> {
  const record = await getPasskeyChallenge(client, challenge);
  if (!record) {
    return { ok: false, error: "challenge_not_found" };
  }
  if (record.expiresAt < Date.now()) {
    await deletePasskeyChallenge(client, challenge);
    return { ok: false, error: "challenge_expired" };
  }
  return { ok: true, record };
}

export async function consumeChallenge(client: Client, challenge: string): Promise<void> {
  await deletePasskeyChallenge(client, challenge);
}
