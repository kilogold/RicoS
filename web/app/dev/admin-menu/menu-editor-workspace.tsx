"use client";

import { useMenuEditor } from "./menu-editor-context";
import { MenuEditorAdvancedPane } from "./menu-editor-advanced-pane";
import { MenuEditorBasicEditPane } from "./menu-editor-basic-edit-pane";
import { MenuEditorCatalogSidebar } from "./menu-editor-catalog-sidebar";
import { MenuEditorFeedback } from "./menu-editor-feedback";
import { MenuEditorItemChrome } from "./menu-editor-item-chrome";
import { StatusBanner } from "./menu-editor-fields";
import { MenuStructurePane } from "./menu-editor-panels";

export function MenuEditorWorkspace() {
  const {
    theme,
    isOrganizeMode,
    editorTab,
    mainPanelRef,
    menu,
    structureTheme,
    setStructureTheme,
    updateThemes,
    setEditorTab,
    selected,
  } = useMenuEditor();

  const themeNames = Object.keys(menu.themes);
  const showItemEditor = !isOrganizeMode && Boolean(selected.item);

  return (
    <div
      className={`mt-5 grid gap-5 ${isOrganizeMode ? "grid-cols-1" : "lg:grid-cols-[330px_minmax(0,1fr)]"}`}
    >
      {!isOrganizeMode ? <MenuEditorCatalogSidebar /> : null}

      <section ref={mainPanelRef} className="min-w-0 space-y-5">
        <MenuEditorFeedback />

        {isOrganizeMode ? (
          <MenuStructurePane
            menu={menu}
            theme={theme}
            selectedTheme={structureTheme || (themeNames[0] ?? "")}
            onSelectTheme={setStructureTheme}
            onUpdateThemes={updateThemes}
            onGoToDailyPricing={() => setEditorTab("basic-edit")}
          />
        ) : null}

        {showItemEditor ? (
          <>
            <MenuEditorItemChrome />
            {editorTab === "basic-edit" ? <MenuEditorBasicEditPane /> : null}
            {editorTab === "advanced-setup" ? <MenuEditorAdvancedPane /> : null}
          </>
        ) : null}

        {!isOrganizeMode && !selected.item ? (
          <StatusBanner tone="neutral">Select or add an item to start editing.</StatusBanner>
        ) : null}
      </section>
    </div>
  );
}
