import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

export type ParsedRegisterOptionsBody = {
  setupSecret?: string;
  name?: string;
  approval?: AuthenticationResponseJSON;
};

export function parseRegisterOptionsBody(body: {
  setupSecret?: unknown;
  name?: unknown;
  approval?: unknown;
}):
  | { ok: true; payload: ParsedRegisterOptionsBody }
  | { ok: false; error: string } {
  const payload: ParsedRegisterOptionsBody = {};

  if (body.setupSecret !== undefined) {
    if (typeof body.setupSecret !== "string") {
      return { ok: false, error: "invalid_setupSecret" };
    }
    payload.setupSecret = body.setupSecret;
  }

  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return { ok: false, error: "invalid_name" };
    }
    payload.name = body.name;
  }

  if (body.approval !== undefined && body.approval !== null) {
    if (typeof body.approval !== "object") {
      return { ok: false, error: "invalid_approval" };
    }
    payload.approval = body.approval as AuthenticationResponseJSON;
  }

  return { ok: true, payload };
}
