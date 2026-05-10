import { handleStaffListOrdersRequest } from "@/lib/commerce/web-api/staff-order-management/adapters/http";

export async function GET(req: Request) {
  return handleStaffListOrdersRequest(req);
}
