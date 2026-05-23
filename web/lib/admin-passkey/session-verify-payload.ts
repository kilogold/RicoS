import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

export type ParsedSessionVerifyBody = {
  authenticationResponse: AuthenticationResponseJSON;
};

export function parseSessionVerifyBody(body: {
  authenticationResponse?: unknown;
}):
  | { ok: true; payload: ParsedSessionVerifyBody }
  | { ok: false; error: string } {
  const authenticationResponse = body.authenticationResponse;
  if (!authenticationResponse || typeof authenticationResponse !== "object") {
    return { ok: false, error: "invalid_authentication_response" };
  }

  return {
    ok: true,
    payload: {
      authenticationResponse: authenticationResponse as AuthenticationResponseJSON,
    },
  };
}
