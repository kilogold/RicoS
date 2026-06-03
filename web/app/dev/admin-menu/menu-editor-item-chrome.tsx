"use client";

import { useMenuEditor } from "./menu-editor-context";
import { itemDisplayName } from "./menu-editor-utils";

export function MenuEditorItemChrome() {
  const {
    theme,
    editorTab,
    selected,
    duplicateItem,
    removeItem,
  } = useMenuEditor();

  const item = selected.item;
  if (!item) return null;

  return (
    <div className={`overflow-hidden rounded-lg border ${theme.panel}`}>
      <div className="border-l-4 border-violet-500 px-5 py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className={`text-sm font-medium ${theme.accentText}`}>
              {selected.category?.title.en ?? "Category"}
            </p>
            <h2 className={`mt-1 truncate text-2xl font-normal ${theme.strongText}`}>
              {itemDisplayName(item)}
            </h2>
            {editorTab === "basic-edit" ? (
              <p className={`mt-2 text-sm ${theme.mutedText}`}>
                Update price and taxes, then publish when ready.
              </p>
            ) : (
              <p className={`mt-2 text-sm ${theme.mutedText}`}>
                Full item setup: names, descriptions, choices, and rules.
              </p>
            )}
          </div>
          {editorTab === "advanced-setup" ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={duplicateItem}
                className={`min-h-10 rounded-md border px-3 text-sm font-medium ${theme.neutralButton}`}
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={removeItem}
                className={`min-h-10 rounded-md border px-3 text-sm font-medium ${theme.dangerButton}`}
              >
                Remove
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
