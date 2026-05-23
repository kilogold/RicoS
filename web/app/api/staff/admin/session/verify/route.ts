import { handleStaffAdminSessionVerifyRequest } from "@/lib/admin-passkey/handlers/session-verify";
import { readJsonBody, jsonError } from "@/lib/admin-passkey/http";
import { parseSessionVerifyBody } from "@/lib/admin-passkey/session-verify-payload";

export async function POST(req: Request) {
  const parsed = await readJsonBody<{ authenticationResponse?: unknown }>(req);
  if (!parsed.ok) return parsed.response;

  const body = parseSessionVerifyBody(parsed.body);
  if (!body.ok) {
    return jsonError(body.error, 400);
  }

  return handleStaffAdminSessionVerifyRequest(req, body.payload);
}
