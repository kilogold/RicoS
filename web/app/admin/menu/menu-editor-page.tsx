"use client";

import { useMenuEditor } from "./menu-editor-context";
import { MenuEditorHeader } from "./menu-editor-header";
import { MenuEditorWorkspace } from "./menu-editor-workspace";

export function MenuEditorPage() {
  const { theme } = useMenuEditor();

  return (
    <main className={`min-h-dvh px-4 py-6 sm:px-6 lg:px-8 ${theme.page}`}>
      <div className="mx-auto max-w-7xl">
        <MenuEditorHeader />
        <MenuEditorWorkspace />
      </div>
    </main>
  );
}
