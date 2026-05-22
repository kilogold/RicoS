import { handleStaffAdminRefundVerifyAndRunRequest } from "@/lib/admin-passkey/handlers/refund-verify-and-run";
import { readJsonBody, jsonError } from "@/lib/admin-passkey/http";
import { parseStaffRefundVerifyBody } from "@/lib/admin-passkey/refund-verify-payload";

export async function POST(req: Request) {
  const parsed = await readJsonBody<{
    orderReference?: unknown;
    amountCents?: unknown;
    solanaRefundTransactionSignature?: unknown;
    idempotencyKey?: unknown;
    authenticationResponse?: unknown;
  }>(req);
  if (!parsed.ok) return parsed.response;

  const body = parseStaffRefundVerifyBody(parsed.body);
  if (!body.ok) {
    return jsonError(body.error, 400);
  }

  return handleStaffAdminRefundVerifyAndRunRequest(req, body.payload);
}
