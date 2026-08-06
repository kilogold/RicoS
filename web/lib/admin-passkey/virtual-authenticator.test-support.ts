/**
 * A minimal software FIDO2 authenticator used only by tests, so the
 * happy-path tests exercise the real `@simplewebauthn/server` verification
 * code (real CBOR/COSE encoding, real ECDSA signatures) rather than mocking
 * it away. Not imported by any production code path.
 */
import { createHash, createSign, generateKeyPairSync, randomBytes, type KeyObject } from "node:crypto";
import { encodeCBOR, type CBORType } from "@levischuck/tiny-cbor";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED_CREDENTIAL_DATA = 0x40;
const REGISTRATION_FLAGS = FLAG_USER_PRESENT | FLAG_USER_VERIFIED | FLAG_ATTESTED_CREDENTIAL_DATA;
const AUTHENTICATION_FLAGS = FLAG_USER_PRESENT | FLAG_USER_VERIFIED;

const COSE_KEY_TYPE = 1;
const COSE_ALGORITHM = 3;
const COSE_CURVE = -1;
const COSE_X_COORDINATE = -2;
const COSE_Y_COORDINATE = -3;
const COSE_KEY_TYPE_EC2 = 2;
const COSE_ALGORITHM_ES256 = -7;
const COSE_CURVE_P256 = 1;

export type VirtualPasskey = {
  credentialId: string;
  credentialIdBytes: Buffer;
  privateKey: KeyObject;
  publicKeyCose: Uint8Array;
};

function base64url(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString("base64url");
}

function rpIdHash(rpId: string): Buffer {
  return createHash("sha256").update(rpId).digest();
}

function buildAuthenticatorData(rpId: string, flags: number, counter: number, attestedCredentialData?: Buffer): Buffer {
  const counterBuf = Buffer.alloc(4);
  counterBuf.writeUInt32BE(counter, 0);
  const parts = [rpIdHash(rpId), Buffer.from([flags]), counterBuf];
  if (attestedCredentialData) parts.push(attestedCredentialData);
  return Buffer.concat(parts);
}

export function createVirtualPasskey(): VirtualPasskey {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };

  const cose = new Map<number, CBORType>([
    [COSE_KEY_TYPE, COSE_KEY_TYPE_EC2],
    [COSE_ALGORITHM, COSE_ALGORITHM_ES256],
    [COSE_CURVE, COSE_CURVE_P256],
    [COSE_X_COORDINATE, Buffer.from(jwk.x, "base64url")],
    [COSE_Y_COORDINATE, Buffer.from(jwk.y, "base64url")],
  ]);

  const credentialIdBytes = randomBytes(32);
  return {
    credentialId: base64url(credentialIdBytes),
    credentialIdBytes,
    privateKey,
    publicKeyCose: encodeCBOR(cose),
  };
}

export function buildRegistrationResponse(params: {
  passkey: VirtualPasskey;
  challenge: string;
  origin: string;
  rpId: string;
}): RegistrationResponseJSON {
  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: "webauthn.create",
      challenge: params.challenge,
      origin: params.origin,
      crossOrigin: false,
    }),
  );

  const aaguid = Buffer.alloc(16);
  const credentialIdLength = Buffer.alloc(2);
  credentialIdLength.writeUInt16BE(params.passkey.credentialIdBytes.length, 0);
  const attestedCredentialData = Buffer.concat([
    aaguid,
    credentialIdLength,
    params.passkey.credentialIdBytes,
    Buffer.from(params.passkey.publicKeyCose),
  ]);

  const authData = buildAuthenticatorData(params.rpId, REGISTRATION_FLAGS, 0, attestedCredentialData);

  const attestationObject = encodeCBOR(
    new Map<string, CBORType>([
      ["fmt", "none"],
      ["attStmt", new Map()],
      ["authData", authData],
    ]),
  );

  return {
    id: params.passkey.credentialId,
    rawId: params.passkey.credentialId,
    response: {
      clientDataJSON: base64url(clientDataJSON),
      attestationObject: base64url(attestationObject),
      transports: [],
    },
    clientExtensionResults: {},
    type: "public-key",
  };
}

export function buildAuthenticationResponse(params: {
  passkey: VirtualPasskey;
  challenge: string;
  origin: string;
  rpId: string;
  counter?: number;
}): AuthenticationResponseJSON {
  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge: params.challenge,
      origin: params.origin,
      crossOrigin: false,
    }),
  );

  const authenticatorData = buildAuthenticatorData(params.rpId, AUTHENTICATION_FLAGS, params.counter ?? 1);
  const clientDataHash = createHash("sha256").update(clientDataJSON).digest();
  const signatureBase = Buffer.concat([authenticatorData, clientDataHash]);
  const signature = createSign("SHA256").update(signatureBase).sign(params.passkey.privateKey);

  return {
    id: params.passkey.credentialId,
    rawId: params.passkey.credentialId,
    response: {
      clientDataJSON: base64url(clientDataJSON),
      authenticatorData: base64url(authenticatorData),
      signature: base64url(signature),
    },
    clientExtensionResults: {},
    type: "public-key",
  };
}
