import { handleSolanaManualRecoverRequest } from "@/lib/commerce/web-api/staff-order-management/adapters/http";
import { requireStaffPublishAuth } from "@/lib/commerce/web-api/staff-order-management/lib/verify-staff-publish-auth";

export async function POST(req: Request) {
  const unauthorized = requireStaffPublishAuth(req);
  if (unauthorized) return unauthorized;
  return handleSolanaManualRecoverRequest(req);
}
