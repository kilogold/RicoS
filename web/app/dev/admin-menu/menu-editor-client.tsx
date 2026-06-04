"use client";

import type { MenuCatalogFile } from "@ricos/shared";
import { MenuEditorPage } from "./menu-editor-page";
import { MenuEditorProvider } from "./menu-editor-context";

export function AdminMenuEditor({
  initialMenu,
  initialBaseContentHash,
}: {
  initialMenu: MenuCatalogFile;
  initialBaseContentHash: string;
}) {
  return (
    <MenuEditorProvider initialMenu={initialMenu} initialBaseContentHash={initialBaseContentHash}>
      <MenuEditorPage />
    </MenuEditorProvider>
  );
}
