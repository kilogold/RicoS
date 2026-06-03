"use client";

import { useMenuEditor } from "./menu-editor-context";
import { formatDollars, itemDisplayName, valuesEqual } from "./menu-editor-utils";

export function MenuEditorCatalogSidebar() {
  const {
    theme,
    menu,
    baselineMenu,
    editorTab,
    selectedCategoryId,
    selectedItemId,
    setSelectedItemId,
    chooseCategory,
    addItem,
  } = useMenuEditor();

  return (
    <aside className={`min-w-0 rounded-lg border p-4 ${theme.panel}`}>
      <div>
        <h2 className={`text-base font-medium ${theme.strongText}`}>Items</h2>
        <p className={`mt-1 text-xs ${theme.mutedText}`}>
          {editorTab === "advanced-setup"
            ? "Pick an item to edit, or add a new one."
            : "Pick an item to update its price."}
        </p>
        {editorTab === "advanced-setup" ? (
          <button
            type="button"
            disabled={!selectedCategoryId}
            onClick={addItem}
            className={`mt-3 min-h-9 rounded-md border px-3 text-sm font-medium ${theme.softButton}`}
          >
            Add item
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {menu.categories.map((category) => {
          const baselineCategory = baselineMenu.categories.find(
            (candidate) => candidate.id === category.id,
          );
          const categoryChanged = !baselineCategory || !valuesEqual(category, baselineCategory);
          return (
            <section
              key={category.id}
              className={`rounded-md border ${
                categoryChanged ? theme.changedPanel : theme.cardBorder
              }`}
            >
              <button
                type="button"
                onClick={() => chooseCategory(category)}
                className={`w-full px-3 py-3 text-left text-sm ${
                  selectedCategoryId === category.id
                    ? theme.categoryButtonActive
                    : theme.categoryButton
                }`}
              >
                <span className="block font-medium">{category.title.en || category.id}</span>
                <span className={`mt-0.5 block text-xs ${theme.mutedText}`}>
                  {category.items.length} items
                  {categoryChanged ? (
                    <span className={`ml-2 font-semibold ${theme.changedText}`}>Edited</span>
                  ) : null}
                </span>
              </button>
              {selectedCategoryId === category.id ? (
                <div className={`border-t py-2 ${theme.divider}`}>
                  {category.items.map((item) => {
                    const baselineItem = baselineCategory?.items.find(
                      (candidate) => candidate.id === item.id,
                    );
                    const itemChanged = !baselineItem || !valuesEqual(item, baselineItem);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedItemId(item.id)}
                        className={`block w-full px-3 py-2.5 text-left text-sm ${
                          selectedItemId === item.id ? theme.itemButtonActive : theme.itemButton
                        }`}
                      >
                        <span className="block truncate">{itemDisplayName(item)}</span>
                        <span className={`mt-0.5 block text-xs ${theme.mutedText}`}>
                          ${formatDollars(item.priceCents)}
                          {itemChanged ? (
                            <span className={`ml-2 font-semibold ${theme.changedText}`}>
                              Edited
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
