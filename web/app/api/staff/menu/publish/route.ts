import { handleStaffMenuPublishRequest } from "@/lib/commerce/web-api/staff-order-management/adapters/http";

export async function POST(req: Request) {
  return handleStaffMenuPublishRequest(req.headers.get("authorization"));
}
