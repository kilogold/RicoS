"use client";

import { useMenuEditor } from "./menu-editor-context";
import { PublishReadinessBar, WorkAreaTabs } from "./menu-editor-panels";

export function MenuEditorHeader() {
  const {
    theme,
    itemCount,
    menu,
    editedItemCount,
    themesChanged,
    editorTab,
    setEditorTab,
    readinessIssues,
    hasChanges,
    publishDisabled,
    busy,
    commitAndPublish,
    jumpToIssue,
  } = useMenuEditor();

  return (
    <header className={`overflow-hidden rounded-lg border ${theme.panel}`}>
      <div className="h-2 bg-violet-600" />
      <div className="space-y-4 px-5 py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className={`text-sm font-medium ${theme.accentText}`}>RicoS catalog</p>
            <h1 className={`mt-1 text-2xl font-normal tracking-normal ${theme.strongText}`}>
              Menu editor
            </h1>
            <p className={`mt-2 text-sm ${theme.mutedText}`}>
              {itemCount} items · {menu.categories.length} categories
              {editedItemCount > 0 || themesChanged ? (
                <span className={`ml-2 font-medium ${theme.changedText}`}>
                  {editedItemCount > 0 ? `${editedItemCount} items edited` : null}
                  {editedItemCount > 0 && themesChanged ? " · " : null}
                  {themesChanged ? "themes edited" : null}
                </span>
              ) : null}
            </p>
          </div>
          <WorkAreaTabs activeTab={editorTab} onTabChange={setEditorTab} theme={theme} />
        </div>
        <PublishReadinessBar
          issues={readinessIssues}
          hasChanges={hasChanges}
          editedItemCount={editedItemCount + (themesChanged ? 1 : 0)}
          busy={busy}
          publishDisabled={publishDisabled}
          onPublish={() => void commitAndPublish()}
          onJumpToIssue={jumpToIssue}
        />
      </div>
    </header>
  );
}
