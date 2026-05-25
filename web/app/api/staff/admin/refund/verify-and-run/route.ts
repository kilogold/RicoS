import { readJsonBody, jsonError } from "@/lib/admin-passkey/http";
import { handleStaffAdminRefundVerifyAndRunRequest } from "@/lib/commerce/web-api/staff-order-management/staff-refund/handlers/verify-and-run";
import { parseStaffRefundVerifyBody } from "@/lib/commerce/web-api/staff-order-management/staff-refund/verify-payload";
import { requireStaffPublishAuth } from "@/lib/commerce/web-api/staff-order-management/lib/verify-staff-publish-auth";

export async function POST(req: Request) {
  const unauthorized = requireStaffPublishAuth(req);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonBody<{
    orderReference?: unknown;
    amountCents?: unknown;
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
