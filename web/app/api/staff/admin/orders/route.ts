import { handleStaffListOrdersRequest } from "@/lib/commerce/web-api/staff-order-management/adapters/http";
import { requireStaffPublishAuth } from "@/lib/commerce/web-api/staff-order-management/lib/verify-staff-publish-auth";

export async function GET(req: Request) {
  const unauthorized = requireStaffPublishAuth(req);
  if (unauthorized) return unauthorized;
  return handleStaffListOrdersRequest(req);
}
