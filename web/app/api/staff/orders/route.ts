import { handleStaffOrdersPost } from "@/lib/commerce/web-api/staff-order-management";

export async function POST() {
  return handleStaffOrdersPost();
}
