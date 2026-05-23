import type { Viewport } from "next";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminCookie,
} from "@/lib/admin-passkey/admin-cookie";
import { AdminPasskeyLogin } from "./admin-passkey-login";

export const viewport: Viewport = {
  themeColor: "#07182b",
  viewportFit: "cover",
};

export default async function AdminOrderTestLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const session = verifyAdminCookie(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);

  if (!session.ok) {
    return <AdminPasskeyLogin />;
  }

  return children;
}
