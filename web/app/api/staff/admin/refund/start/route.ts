import { handleStaffAdminRefundStartRequest } from "@/lib/admin-passkey/handlers/refund-start";
import { readJsonBody, jsonError } from "@/lib/admin-passkey/http";
import { parseStaffRefundBody } from "@/lib/admin-passkey/refund-payload";
import { requireStaffPublishAuth } from "@/lib/commerce/web-api/staff-order-management/lib/verify-staff-publish-auth";

export async function POST(req: Request) {
  const unauthorized = requireStaffPublishAuth(req);
  if (unauthorized) return unauthorized;

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
