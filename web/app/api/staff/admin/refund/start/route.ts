import { readJsonBody, jsonError } from "@/lib/admin-passkey/http";
import { handleStaffAdminRefundStartRequest } from "@/lib/commerce/web-api/staff-order-management/staff-refund/handlers/start";
import { parseStaffRefundBody } from "@/lib/commerce/web-api/staff-order-management/staff-refund/payload";
import { requireStaffPublishAuth } from "@/lib/commerce/web-api/staff-order-management/lib/verify-staff-publish-auth";

export async function POST(req: Request) {
  const unauthorized = requireStaffPublishAuth(req);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonBody<{
    orderReference?: unknown;
    amountCents?: unknown;
    idempotencyKey?: unknown;
  }>(req);
  if (!parsed.ok) return parsed.response;

  const body = parseStaffRefundBody(parsed.body);
  if (!body.ok) {
    return jsonError(body.error, 400);
  }

  return handleStaffAdminRefundStartRequest(body.payload);
}
