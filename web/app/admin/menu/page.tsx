import { fetchCurrentGitMenuForEditor } from "@/lib/commerce/web-api/staff-order-management/lib/menu-editor-source";
import { AdminMenuEditor } from "./menu-editor-client";

export default async function AdminMenuPage() {
  const source = await fetchCurrentGitMenuForEditor();

  return <AdminMenuEditor initialMenu={source.menu} initialBaseContentHash={source.contentHash} />;
}
