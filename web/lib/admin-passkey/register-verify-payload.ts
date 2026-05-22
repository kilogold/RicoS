import type { RegistrationResponseJSON } from "@simplewebauthn/server";

export type ParsedRegisterVerifyBody = {
  registrationResponse: RegistrationResponseJSON;
  name: string | null;
};

export function parseRegisterVerifyBody(body: {
  name?: unknown;
  registrationResponse?: unknown;
}):
  | { ok: true; payload: ParsedRegisterVerifyBody }
  | { ok: false; error: string } {
  const registrationResponse = body.registrationResponse;
  if (!registrationResponse || typeof registrationResponse !== "object") {
    return { ok: false, error: "invalid_registration_response" };
  }

  let name: string | null = null;
  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return { ok: false, error: "invalid_name" };
    }
    const trimmed = body.name.trim();
    if (trimmed) name = trimmed;
  }

  return {
    ok: true,
    payload: {
      registrationResponse: registrationResponse as RegistrationResponseJSON,
      name,
    },
  };
}
