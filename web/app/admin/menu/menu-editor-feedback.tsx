"use client";

import { useMenuEditor } from "./menu-editor-context";
import { StatusBanner } from "./menu-editor-fields";

export function MenuEditorFeedback() {
  const { theme, status, error, conflict } = useMenuEditor();

  if (!status && !error) return null;

  return (
    <div className="space-y-3">
      {status ? <StatusBanner tone="success">{status}</StatusBanner> : null}
      {error ? (
        <>
          <StatusBanner tone="error">{error}</StatusBanner>
          {conflict ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={`min-h-10 rounded-md border px-3 text-sm font-medium ${theme.neutralButton}`}
            >
              Refresh and start over
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
