import { maxAllowedPasskeys } from "@/lib/admin-passkey/config";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import { countAdminPasskeys } from "@/lib/infrastructure/turso/webhook-db";
import AdminPasskeySetupClient from "./setup-client";

export default async function AdminPasskeySetupPage() {
  const db = await getWebhookDb();
  const passkeyCount = await countAdminPasskeys(db);

  return (
    <AdminPasskeySetupClient
      passkeyCount={passkeyCount}
      maxAllowed={maxAllowedPasskeys()}
    />
  );
}
