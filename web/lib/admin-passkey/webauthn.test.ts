const RP_ID = "test.ricos.local";
const ORIGIN = `https://${RP_ID}`;

import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  persistActionChallenge,
  persistRegisterChallenge,
  persistRegisterGateChallenge,
} from "@/lib/admin-passkey/challenges";
import {
  buildAuthenticationResponse,
  buildRegistrationResponse,
  createVirtualPasskey,
} from "@/lib/admin-passkey/virtual-authenticator.test-support";
import {
  countAdminPasskeys,
  getEnrollingAdminPasskey,
  insertPasskey,
  migrate,
} from "@/lib/infrastructure/turso/webhook-db";

// config.ts reads WEBAUTHN_RP_ID at module-evaluation time, so webauthn.ts
// (which imports it) must be loaded dynamically, after the env var is set —
// a static import would be hoisted ahead of the assignment below.
let webauthn: typeof import("@/lib/admin-passkey/webauthn");

describe("webauthn passkey flows", () => {
  let db: Client;

  beforeAll(async () => {
    process.env.WEBAUTHN_RP_ID = RP_ID;
    webauthn = await import("@/lib/admin-passkey/webauthn");
  });

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  afterEach(() => {
    db.close();
  });

  // Regression test for the enrollment bypass: a challenge minted on the
  // ungated register/options path (register_gate) must never be redeemable
  // at register/verify, which only accepts "register".
  test("a register_gate challenge is rejected at register/verify", async () => {
    const challenge = "gate-challenge-token";
    await persistRegisterGateChallenge(db, challenge);

    const passkey = createVirtualPasskey();
    const response = buildRegistrationResponse({ passkey, challenge, origin: ORIGIN, rpId: RP_ID });

    const result = await webauthn.verifyPasskeyRegistration({
      client: db,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      response,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid_challenge_type");
    }
  });

  test("a gate approval is rejected when the credential is not the enrolling (first) passkey", async () => {
    const passkeyA = createVirtualPasskey();
    const passkeyB = createVirtualPasskey();
    await insertPasskey(db, {
      credentialId: passkeyA.credentialId,
      publicKey: Buffer.from(passkeyA.publicKeyCose).toString("base64"),
      counter: 0,
    });
    await insertPasskey(db, {
      credentialId: passkeyB.credentialId,
      publicKey: Buffer.from(passkeyB.publicKeyCose).toString("base64"),
      counter: 0,
    });

    // created_at has millisecond resolution and ties break on credential_id,
    // which is random — don't assume insertion order is enrollment order.
    const enroller = await getEnrollingAdminPasskey(db);
    const nonEnrolling = enroller?.credentialId === passkeyA.credentialId ? passkeyB : passkeyA;

    const challenge = "gate-challenge-non-enrolling";
    await persistRegisterGateChallenge(db, challenge);
    const response = buildAuthenticationResponse({
      passkey: nonEnrolling,
      challenge,
      origin: ORIGIN,
      rpId: RP_ID,
      counter: 1,
    });

    const result = await webauthn.verifyRegisterGateAuthentication({
      client: db,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      response,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("not_enrolling_passkey");
    }
  });

  test("bootstrap -> login -> gated enrollment of a second passkey -> payload-bound action approval", async () => {
    // Bootstrap: enroll the first (enrolling) passkey.
    const first = createVirtualPasskey();
    const { challenge: bootstrapChallenge } = await webauthn.generatePasskeyRegistrationOptions();
    await persistRegisterChallenge(db, bootstrapChallenge);
    const bootstrapResponse = buildRegistrationResponse({
      passkey: first,
      challenge: bootstrapChallenge,
      origin: ORIGIN,
      rpId: RP_ID,
    });
    const bootstrapResult = await webauthn.verifyPasskeyRegistration({
      client: db,
      expectedChallenge: bootstrapChallenge,
      expectedOrigin: ORIGIN,
      response: bootstrapResponse,
    });
    expect(bootstrapResult.ok).toBe(true);
    if (!bootstrapResult.ok) return;
    await insertPasskey(db, {
      credentialId: bootstrapResult.credentialId,
      publicKey: bootstrapResult.publicKey,
      counter: bootstrapResult.counter,
    });

    expect(await countAdminPasskeys(db)).toBe(1);
    const enroller = await getEnrollingAdminPasskey(db);
    expect(enroller?.credentialId).toBe(first.credentialId);

    // Login: an action challenge signed by the first passkey opens a session.
    const { challenge: loginChallenge } = await webauthn.generateActionAuthenticationOptions(db);
    await persistActionChallenge(db, { challenge: loginChallenge, actionName: "session", payloadHash: "" });
    const loginResponse = buildAuthenticationResponse({
      passkey: first,
      challenge: loginChallenge,
      origin: ORIGIN,
      rpId: RP_ID,
      counter: 1,
    });
    const loginResult = await webauthn.verifyActionAuthentication({
      client: db,
      expectedChallenge: loginChallenge,
      expectedOrigin: ORIGIN,
      response: loginResponse,
      expectedPayloadHash: "",
      expectedActionName: "session",
    });
    expect(loginResult.ok).toBe(true);
    if (!loginResult.ok) return;
    expect(loginResult.passkey.credentialId).toBe(first.credentialId);

    // Gated enrollment: the enrolling passkey approves, then a second passkey is enrolled.
    const { challenge: gateChallenge } = await webauthn.generateRegisterAuthenticationOptions(db);
    await persistRegisterGateChallenge(db, gateChallenge);
    const gateResponse = buildAuthenticationResponse({
      passkey: first,
      challenge: gateChallenge,
      origin: ORIGIN,
      rpId: RP_ID,
      counter: 2,
    });
    const gateResult = await webauthn.verifyRegisterGateAuthentication({
      client: db,
      expectedChallenge: gateChallenge,
      expectedOrigin: ORIGIN,
      response: gateResponse,
    });
    expect(gateResult.ok).toBe(true);
    if (!gateResult.ok) return;

    const second = createVirtualPasskey();
    const { challenge: enrollChallenge } = await webauthn.generatePasskeyRegistrationOptions();
    await persistRegisterChallenge(db, enrollChallenge);
    const enrollResponse = buildRegistrationResponse({
      passkey: second,
      challenge: enrollChallenge,
      origin: ORIGIN,
      rpId: RP_ID,
    });
    const enrollResult = await webauthn.verifyPasskeyRegistration({
      client: db,
      expectedChallenge: enrollChallenge,
      expectedOrigin: ORIGIN,
      response: enrollResponse,
    });
    expect(enrollResult.ok).toBe(true);
    if (!enrollResult.ok) return;
    await insertPasskey(db, {
      credentialId: enrollResult.credentialId,
      publicKey: enrollResult.publicKey,
      counter: enrollResult.counter,
    });
    expect(await countAdminPasskeys(db)).toBe(2);

    // Payload-bound action approval (the refund shape): any registered passkey may approve,
    // and the approval is cryptographically bound to the exact payload hash.
    const payloadHash = "order-123:4000";
    const { challenge: actionChallenge } = await webauthn.generateActionAuthenticationOptions(db);
    await persistActionChallenge(db, { challenge: actionChallenge, actionName: "refund", payloadHash });
    const actionResponse = buildAuthenticationResponse({
      passkey: second,
      challenge: actionChallenge,
      origin: ORIGIN,
      rpId: RP_ID,
      counter: 1,
    });
    const actionResult = await webauthn.verifyActionAuthentication({
      client: db,
      expectedChallenge: actionChallenge,
      expectedOrigin: ORIGIN,
      response: actionResponse,
      expectedPayloadHash: payloadHash,
      expectedActionName: "refund",
    });
    expect(actionResult.ok).toBe(true);
    if (!actionResult.ok) return;
    expect(actionResult.passkey.credentialId).toBe(second.credentialId);
  });

  test("an action approval is rejected when the payload hash does not match what was approved", async () => {
    const passkey = createVirtualPasskey();
    await insertPasskey(db, {
      credentialId: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKeyCose).toString("base64"),
      counter: 0,
    });

    const challenge = "action-challenge-tamper";
    await persistActionChallenge(db, {
      challenge,
      actionName: "refund",
      payloadHash: "order-123:4000",
    });
    const response = buildAuthenticationResponse({ passkey, challenge, origin: ORIGIN, rpId: RP_ID, counter: 1 });

    const result = await webauthn.verifyActionAuthentication({
      client: db,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      response,
      expectedPayloadHash: "order-123:9999",
      expectedActionName: "refund",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("payload_hash_mismatch");
    }
  });
});
