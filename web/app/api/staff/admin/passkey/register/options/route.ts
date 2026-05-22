import { handleAdminPasskeyRegisterOptionsRequest } from "@/lib/admin-passkey/handlers/register-options";
import { readJsonBody, jsonError } from "@/lib/admin-passkey/http";
import { parseRegisterOptionsBody } from "@/lib/admin-passkey/register-options-payload";

export async function POST(req: Request) {
  const parsed = await readJsonBody<{
    setupSecret?: unknown;
    name?: unknown;
    approval?: unknown;
  }>(req);
  if (!parsed.ok) return parsed.response;

  const body = parseRegisterOptionsBody(parsed.body);
  if (!body.ok) {
    return jsonError(body.error, 400);
  }

  return handleAdminPasskeyRegisterOptionsRequest(req, body.payload);
}
