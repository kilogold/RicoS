import { handleStaffAdminRefundStartRequest } from "@/lib/admin-passkey/handlers/refund-start";
import { readJsonBody, jsonError } from "@/lib/admin-passkey/http";
import { parseStaffRefundBody } from "@/lib/admin-passkey/refund-payload";

export async function POST(req: Request) {
  const parsed = await readJsonBody<{
    orderReference?: unknown;
    amountCents?: unknown;
    solanaRefundTransactionSignature?: unknown;
    idempotencyKey?: unknown;
  }>(req);
  if (!parsed.ok) return parsed.response;

  const body = parseStaffRefundBody(parsed.body);
  if (!body.ok) {
    return jsonError(body.error, 400);
  }

  return handleStaffAdminRefundStartRequest(body.payload);
}
