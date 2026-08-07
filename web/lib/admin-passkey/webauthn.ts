import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import type { Client } from "@libsql/client";
import {
  getEnrollingAdminPasskey,
  getPasskeyByCredentialId,
  listAdminPasskeyCredentials,
  type AdminPasskeyRecord,
} from "@/lib/infrastructure/turso/webhook-db";
import { WEBAUTHN_RP_ID, WEBAUTHN_RP_NAME } from "@/lib/admin-passkey/config";
import { consumeChallenge, loadChallenge } from "@/lib/admin-passkey/challenges";
import { logSecurityEvent } from "@/lib/admin-passkey/security-log";

/**
 * Required, not merely preferred: WebAuthn's user-verification bit (biometric
 * or device PIN/passcode — either counts) is the only signal distinguishing
 * "the owner is present" from "a device is present". Refunds rely on that
 * distinction for step-up auth; pairing "preferred" with
 * requireUserVerification: false would accept assertions where the bit was
 * never set, silently degrading refund approval to a mere device tap.
 */
const USER_VERIFICATION = "required" as const;

function rpConfig() {
  return {
    rpID: WEBAUTHN_RP_ID,
    rpName: WEBAUTHN_RP_NAME,
  };
}

export async function generateActionAuthenticationOptions(
  client: Client,
): Promise<{
  options: PublicKeyCredentialRequestOptionsJSON;
  challenge: string;
}> {
  const credentials = await listAdminPasskeyCredentials(client);
  const options = await generateAuthenticationOptions({
    ...rpConfig(),
    allowCredentials: credentials.map((c) => ({
      id: c.credentialId,
      type: "public-key" as const,
    })),
    userVerification: USER_VERIFICATION,
  });
  return { options, challenge: options.challenge };
}

/**
 * Only the enrolling (first-created) passkey may approve new enrollments —
 * `allowCredentials` narrows the browser's picker, but is a hint only and
 * carries no security weight; the real enforcement is in
 * `verifyRegisterGateAuthentication` below.
 */
export async function generateRegisterAuthenticationOptions(
  client: Client,
): Promise<{
  options: PublicKeyCredentialRequestOptionsJSON;
  challenge: string;
}> {
  const enroller = await getEnrollingAdminPasskey(client);
  const options = await generateAuthenticationOptions({
    ...rpConfig(),
    allowCredentials: enroller ? [{ id: enroller.credentialId }] : [],
    userVerification: USER_VERIFICATION,
  });
  return { options, challenge: options.challenge };
}

export async function generatePasskeyRegistrationOptions(): Promise<{
  options: PublicKeyCredentialCreationOptionsJSON;
  challenge: string;
}> {
  const options = await generateRegistrationOptions({
    ...rpConfig(),
    userName: "admin",
    userDisplayName: "RicoS Admin",
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: USER_VERIFICATION,
    },
  });
  return { options, challenge: options.challenge };
}

export async function verifyActionAuthentication(params: {
  client: Client;
  expectedChallenge: string;
  expectedOrigin: string;
  response: AuthenticationResponseJSON;
  expectedPayloadHash?: string;
  expectedActionName?: string;
}): Promise<
  | { ok: true; passkey: AdminPasskeyRecord; newCounter: number }
  | { ok: false; error: string }
> {
  const loaded = await loadChallenge(params.client, params.expectedChallenge);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error };
  }
  const record = loaded.record;
  if (record.type !== "action") {
    logSecurityEvent({
      event: "challenge_type_mismatch",
      outcome: "denied",
      reason: `expected action, got ${record.type}`,
      severity: "high",
    });
    return { ok: false, error: "invalid_challenge_type" };
  }
  if (
    params.expectedActionName &&
    record.actionName !== params.expectedActionName
  ) {
    return { ok: false, error: "action_mismatch" };
  }
  if (
    params.expectedPayloadHash !== undefined &&
    record.payloadHash !== params.expectedPayloadHash
  ) {
    // Explicit undefined check, not truthiness: SESSION_PAYLOAD_HASH is "",
    // which is falsy but must still be enforced as a real binding.
    return { ok: false, error: "payload_hash_mismatch" };
  }

  const credentialId = params.response.id;
  const passkey = await getPasskeyByCredentialId(params.client, credentialId);
  if (!passkey) {
    return { ok: false, error: "unknown_credential" };
  }

  const verification = await verifyAuthenticationResponse({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: params.expectedOrigin,
    expectedRPID: WEBAUTHN_RP_ID,
    credential: {
      id: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKey, "base64"),
      counter: passkey.counter,
      transports: [] as AuthenticatorTransportFuture[],
    },
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.authenticationInfo) {
    return { ok: false, error: "verification_failed" };
  }

  await consumeChallenge(params.client, params.expectedChallenge);
  return {
    ok: true,
    passkey,
    newCounter: verification.authenticationInfo.newCounter,
  };
}

export async function verifyRegisterGateAuthentication(params: {
  client: Client;
  expectedChallenge: string;
  expectedOrigin: string;
  response: AuthenticationResponseJSON;
}): Promise<
  | { ok: true; passkey: AdminPasskeyRecord; newCounter: number }
  | { ok: false; error: string }
> {
  const loaded = await loadChallenge(params.client, params.expectedChallenge);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error };
  }
  if (loaded.record.type !== "register_gate") {
    logSecurityEvent({
      event: "challenge_type_mismatch",
      outcome: "denied",
      reason: `expected register_gate, got ${loaded.record.type}`,
      severity: "high",
    });
    return { ok: false, error: "invalid_challenge_type" };
  }

  const passkey = await getPasskeyByCredentialId(params.client, params.response.id);
  if (!passkey) {
    return { ok: false, error: "unknown_credential" };
  }

  const enroller = await getEnrollingAdminPasskey(params.client);
  if (!enroller || enroller.credentialId !== passkey.credentialId) {
    logSecurityEvent({
      event: "register_gate_non_enrolling_passkey",
      outcome: "denied",
      reason: "credential is not the enrolling passkey",
      credentialId: passkey.credentialId,
      severity: "high",
    });
    return { ok: false, error: "not_enrolling_passkey" };
  }

  const verification = await verifyAuthenticationResponse({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: params.expectedOrigin,
    expectedRPID: WEBAUTHN_RP_ID,
    credential: {
      id: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKey, "base64"),
      counter: passkey.counter,
      transports: [] as AuthenticatorTransportFuture[],
    },
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.authenticationInfo) {
    return { ok: false, error: "verification_failed" };
  }

  await consumeChallenge(params.client, params.expectedChallenge);
  return {
    ok: true,
    passkey,
    newCounter: verification.authenticationInfo.newCounter,
  };
}

export async function verifyPasskeyRegistration(params: {
  client: Client;
  expectedChallenge: string;
  expectedOrigin: string;
  response: RegistrationResponseJSON;
}): Promise<
  | {
      ok: true;
      credentialId: string;
      publicKey: string;
      counter: number;
    }
  | { ok: false; error: string }
> {
  const loaded = await loadChallenge(params.client, params.expectedChallenge);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error };
  }
  if (loaded.record.type !== "register") {
    logSecurityEvent({
      event: "challenge_type_mismatch",
      outcome: "denied",
      reason: `expected register, got ${loaded.record.type}`,
      severity: "high",
    });
    return { ok: false, error: "invalid_challenge_type" };
  }

  const verification = await verifyRegistrationResponse({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: params.expectedOrigin,
    expectedRPID: WEBAUTHN_RP_ID,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, error: "verification_failed" };
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;
  void credentialDeviceType;
  void credentialBackedUp;

  await consumeChallenge(params.client, params.expectedChallenge);
  return {
    ok: true,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64"),
    counter: credential.counter,
  };
}
