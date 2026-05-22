import { handleAdminPasskeyRegisterVerifyRequest } from "@/lib/admin-passkey/handlers/register-verify";
import { readJsonBody, jsonError } from "@/lib/admin-passkey/http";
import { parseRegisterVerifyBody } from "@/lib/admin-passkey/register-verify-payload";

export async function POST(req: Request) {
  const parsed = await readJsonBody<{
    name?: unknown;
    registrationResponse?: unknown;
  }>(req);
  if (!parsed.ok) return parsed.response;

  const body = parseRegisterVerifyBody(parsed.body);
  if (!body.ok) {
    return jsonError(body.error, 400);
  }

  return handleAdminPasskeyRegisterVerifyRequest(req, body.payload);
}
