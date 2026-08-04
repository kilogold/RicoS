import type { Viewport } from "next";
import { forbidden } from "next/navigation";
import { maxAllowedPasskeys } from "@/lib/admin-passkey/config";
import {
  passkeyLimitErrorCode,
  passkeyLimitStatus,
} from "@/lib/admin-passkey/passkey-limit";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import { countAdminPasskeys } from "@/lib/infrastructure/turso/webhook-db";

export const viewport: Viewport = {
  themeColor: "#07182b",
  viewportFit: "cover",
};

export default async function AdminPasskeySetupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const db = await getWebhookDb();
  const passkeyCount = await countAdminPasskeys(db);
  const limit = passkeyLimitStatus(passkeyCount, maxAllowedPasskeys());

  if (limit === "at_limit") {
    forbidden();
  }

  if (limit === "over_limit") {
    throw new Error(passkeyLimitErrorCode(limit) ?? "passkey_limit_exceeded");
  }

  return children;
}
