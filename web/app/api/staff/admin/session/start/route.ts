import { handleStaffAdminSessionStartRequest } from "@/lib/admin-passkey/handlers/session-start";

export async function POST() {
  return handleStaffAdminSessionStartRequest();
}
