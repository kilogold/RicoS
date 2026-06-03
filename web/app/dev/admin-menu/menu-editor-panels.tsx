"use client";

import type { EditorTheme } from "./menu-editor-theme";
import type { EditorTab, ReadinessIssue } from "./menu-editor-readiness";
import { getUnassignedCategories } from "./menu-editor-readiness";
import type { MenuCatalogFile, ModifierGroup } from "@ricos/shared";
import { useState } from "react";

function groupDisplayTitle(group: ModifierGroup): string {
  return group.title.en.trim() || group.title.es.trim() || group.id;
}

function optionDisplayLabel(group: ModifierGroup, optionId: string): string {
  const option = group.options.find((o) => o.id === optionId);
  if (!option) return optionId;
  return option.label.en.trim() || option.label.es.trim() || option.id;
}

export function VisibilityRuleBuilder({
  group,
  groupIndex,
  allGroups,
  theme,
  changed,
  onUpdate,
}: {
  group: ModifierGroup;
  groupIndex: number;
  allGroups: ModifierGroup[];
  theme: EditorTheme;
  changed: boolean;
  onUpdate: (updater: (current: ModifierGroup) => ModifierGroup) => void;
}) {
  const [expanded, setExpanded] = useState(Boolean(group.visibleWhen));
  const driverCandidates = allGroups.filter((_, index) => index !== groupIndex);
  const driverGroup = group.visibleWhen
    ? allGroups.find((g) => g.id === group.visibleWhen?.groupId)
    : undefined;
  const selectedOptionIds = new Set(group.visibleWhen?.optionIds ?? []);

  const preview =
    group.visibleWhen && driverGroup
      ? `This group appears only when "${groupDisplayTitle(driverGroup)}" includes ${group.visibleWhen.optionIds
          .map((id) => `"${optionDisplayLabel(driverGroup, id)}"`)
          .join(" or ")}.`
      : group.visibleWhen?.groupId && !driverGroup
        ? "Pick a valid trigger group and at least one option."
        : null;

  function clearRule() {
    onUpdate((current) => {
      const { visibleWhen: _removed, ...rest } = current;
      return rest;
    });
    setExpanded(false);
  }

  return (
    <div className={`mt-4 rounded-md border p-3 ${theme.nestedPanel}`}>
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className={`flex w-full items-center justify-between text-left text-sm font-medium ${theme.fieldLabel}`}
      >
        <span>Advanced rule: show only when…</span>
        <span className={theme.mutedText}>{expanded ? "Hide" : "Show"}</span>
      </button>

      {expanded ? (
        <div className="mt-4 space-y-4">
          <label className="block">
            <span
              className={`text-sm font-medium ${changed ? theme.changedText : theme.fieldLabel}`}
            >
              When customer picks from
            </span>
            <select
              value={group.visibleWhen?.groupId ?? ""}
              onChange={(event) => {
                const groupId = event.target.value;
                onUpdate((current) => {
                  const optionIds = current.visibleWhen?.optionIds ?? [];
                  if (!groupId) {
                    if (optionIds.length === 0) {
                      const { visibleWhen: _removed, ...rest } = current;
                      return rest;
                    }
                    return { ...current, visibleWhen: { groupId: "", optionIds } };
                  }
                  return { ...current, visibleWhen: { groupId, optionIds: [] } };
                });
              }}
              className={`mt-2 h-12 w-full rounded-md border px-3 text-[15px] outline-none transition focus:ring-2 ${
                changed ? theme.changedField : theme.fieldControl
              }`}
            >
              <option value="">Always show this group</option>
              {driverCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {groupDisplayTitle(candidate)}
                </option>
              ))}
            </select>
          </label>

          {driverGroup ? (
            <fieldset>
              <legend className={`text-sm font-medium ${theme.fieldLabel}`}>
                Show when any of these are selected
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {driverGroup.options.map((option) => {
                  const checked = selectedOptionIds.has(option.id);
                  return (
                    <label
                      key={option.id}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                        checked
                          ? "border-violet-400 bg-violet-500/20 text-violet-100"
                          : theme.checkboxShell
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const groupId = group.visibleWhen?.groupId ?? "";
                          onUpdate((current) => {
                            const prev = new Set(current.visibleWhen?.optionIds ?? []);
                            if (event.target.checked) prev.add(option.id);
                            else prev.delete(option.id);
                            const optionIds = [...prev];
                            if (!groupId && optionIds.length === 0) {
                              const { visibleWhen: _removed, ...rest } = current;
                              return rest;
                            }
                            return { ...current, visibleWhen: { groupId, optionIds } };
                          });
                        }}
                        className="h-4 w-4 accent-violet-500"
                      />
                      {option.label.en || option.label.es || option.id}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {preview ? (
            <p className={`rounded-md border px-3 py-2 text-sm ${theme.nestedPanel} ${theme.regularText}`}>
              {preview}
            </p>
          ) : null}

          {group.visibleWhen ? (
            <button
              type="button"
              onClick={clearRule}
              className={`text-sm font-medium ${theme.dangerButton} rounded-md border px-3 py-2`}
            >
              Remove rule (always show)
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PublishReadinessBar({
  issues,
  hasChanges,
  editedItemCount,
  busy,
  publishDisabled,
  onPublish,
  onJumpToIssue,
}: {
  issues: ReadinessIssue[];
  hasChanges: boolean;
  editedItemCount: number;
  busy: boolean;
  publishDisabled: boolean;
  onPublish: () => void;
  onJumpToIssue: (issue: ReadinessIssue) => void;
}) {
  const blockerCount = issues.length;
  const ready = blockerCount === 0 && hasChanges;

  let publishLabel = "Commit & publish";
  if (busy) publishLabel = "Publishing...";
  else if (blockerCount > 0) publishLabel = `Fix ${blockerCount} issue${blockerCount === 1 ? "" : "s"} before publish`;
  else if (!hasChanges) publishLabel = "No changes to publish";
  else if (editedItemCount > 0) publishLabel = `Publish ${editedItemCount} changed item${editedItemCount === 1 ? "" : "s"}`;

  return (
    <div className="rounded-md border border-slate-700 bg-slate-950/60 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">
            {blockerCount === 0
              ? hasChanges
                ? "Ready to publish"
                : "No pending changes"
              : `${blockerCount} issue${blockerCount === 1 ? "" : "s"} to fix`}
          </p>
          {blockerCount > 0 ? (
            <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-sm text-slate-300">
              {issues.slice(0, 5).map((issue) => (
                <li key={issue.id}>
                  <button
                    type="button"
                    onClick={() => onJumpToIssue(issue)}
                    className="text-left text-violet-300 underline-offset-2 hover:underline"
                  >
                    {issue.message}
                  </button>
                </li>
              ))}
              {issues.length > 5 ? (
                <li className="text-slate-500">+{issues.length - 5} more</li>
              ) : null}
            </ul>
          ) : hasChanges ? (
            <p className="mt-1 text-sm text-slate-400">
              Live menu updates after publish (usually under a minute).
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-400">Change a price or theme layout to publish.</p>
          )}
        </div>
        <button
          type="button"
          disabled={publishDisabled || blockerCount > 0 || !hasChanges}
          onClick={onPublish}
          className="min-h-11 shrink-0 rounded-md bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
        >
          {publishLabel}
        </button>
      </div>
      {ready ? (
        <p className="mt-2 text-xs text-emerald-300/90" role="status">
          All checks passed.
        </p>
      ) : null}
    </div>
  );
}

export function MenuStructurePane({
  menu,
  theme,
  selectedTheme,
  onSelectTheme,
  onUpdateThemes,
  onGoToDailyPricing,
}: {
  menu: MenuCatalogFile;
  theme: EditorTheme;
  selectedTheme: string;
  onSelectTheme: (themeName: string) => void;
  onUpdateThemes: (updater: (themes: MenuCatalogFile["themes"]) => MenuCatalogFile["themes"]) => void;
  onGoToDailyPricing?: () => void;
}) {
  const themeNames = Object.keys(menu.themes);
  const unassigned = getUnassignedCategories(menu);
  const categoryById = new Map(menu.categories.map((c) => [c.id, c]));
  const selectedIds = menu.themes[selectedTheme] ?? [];

  function moveCategoryInTheme(categoryId: string, direction: -1 | 1) {
    onUpdateThemes((themes) => {
      const list = [...(themes[selectedTheme] ?? [])];
      const index = list.indexOf(categoryId);
      if (index < 0) return themes;
      const next = index + direction;
      if (next < 0 || next >= list.length) return themes;
      [list[index], list[next]] = [list[next]!, list[index]!];
      return { ...themes, [selectedTheme]: list };
    });
  }

  function assignToTheme(categoryId: string, targetTheme: string) {
    onUpdateThemes((themes) => {
      const next: MenuCatalogFile["themes"] = {};
      for (const [name, ids] of Object.entries(themes)) {
        next[name] = ids.filter((id) => id !== categoryId);
      }
      next[targetTheme] = [...(next[targetTheme] ?? []), categoryId];
      return next;
    });
  }

  function removeFromTheme(categoryId: string) {
    onUpdateThemes((themes) => {
      const next: MenuCatalogFile["themes"] = {};
      for (const [name, ids] of Object.entries(themes)) {
        next[name] = ids.filter((id) => id !== categoryId);
      }
      return next;
    });
  }

  function rotateCategoryToTheme(categoryId: string, targetTheme: string) {
    assignToTheme(categoryId, targetTheme);
  }

  function reorderThemeKeys(order: string[], themes: MenuCatalogFile["themes"]) {
    const reordered: MenuCatalogFile["themes"] = {};
    for (const key of order) {
      if (themes[key] !== undefined) reordered[key] = themes[key]!;
    }
    return reordered;
  }

  function moveTheme(themeName: string, direction: -1 | 1) {
    onUpdateThemes((themes) => {
      const order = Object.keys(themes);
      const index = order.indexOf(themeName);
      if (index < 0) return themes;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= order.length) return themes;
      [order[index], order[nextIndex]] = [order[nextIndex]!, order[index]!];
      return reorderThemeKeys(order, themes);
    });
  }

  const otherThemes = themeNames.filter((t) => t !== selectedTheme);

  return (
    <div className={`rounded-lg border p-5 ${theme.panel}`}>
      <p className={`mt-1 text-sm ${theme.mutedText}`}>
        Theme order is the order customers see on the menu. Use ↑↓ to reorder themes and
        categories within each theme.
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="space-y-1">
          <p className={`mb-2 text-xs font-medium uppercase tracking-wide ${theme.mutedText}`}>
            Themes
          </p>
          {themeNames.map((name, themeIndex) => (
            <div
              key={name}
              className={`flex items-stretch gap-1 rounded-md ${
                selectedTheme === name ? theme.categoryButtonActive : ""
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectTheme(name)}
                className={`min-w-0 flex-1 rounded-md px-3 py-2.5 text-left text-sm capitalize ${
                  selectedTheme === name ? "" : theme.categoryButton
                }`}
              >
                {name}
                <span className={`mt-0.5 block text-xs ${theme.mutedText}`}>
                  {(menu.themes[name] ?? []).length} categories
                </span>
              </button>
              <div className="flex shrink-0 flex-col gap-1 py-1">
                <button
                  type="button"
                  aria-label={`Move ${name} theme up`}
                  disabled={themeIndex === 0}
                  onClick={() => moveTheme(name, -1)}
                  className={`min-h-8 rounded-md border px-2 text-sm disabled:opacity-30 ${theme.neutralButton}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${name} theme down`}
                  disabled={themeIndex === themeNames.length - 1}
                  onClick={() => moveTheme(name, 1)}
                  className={`min-h-8 rounded-md border px-2 text-sm disabled:opacity-30 ${theme.neutralButton}`}
                >
                  ↓
                </button>
              </div>
            </div>
          ))}
        </div>

        <div>
          <p className={`text-sm font-medium ${theme.strongText}`}>
            Categories in <span className="capitalize">{selectedTheme}</span>
          </p>
          <ul className="mt-3 space-y-2">
            {selectedIds.map((categoryId) => {
              const category = categoryById.get(categoryId);
              if (!category) return null;
              return (
                <li
                  key={categoryId}
                  className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 ${theme.nestedPanel}`}
                >
                  <span className="min-w-0 flex-1 text-sm font-medium">
                    {category.title.en || category.id}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      aria-label="Move up"
                      onClick={() => moveCategoryInTheme(categoryId, -1)}
                      className={`min-h-9 rounded-md border px-2 text-sm ${theme.neutralButton}`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      onClick={() => moveCategoryInTheme(categoryId, 1)}
                      className={`min-h-9 rounded-md border px-2 text-sm ${theme.neutralButton}`}
                    >
                      ↓
                    </button>
                    {otherThemes.length > 0 ? (
                      <select
                        aria-label={`Move ${category.title.en} to another theme`}
                        className={`min-h-9 rounded-md border px-2 text-sm ${theme.fieldControl}`}
                        defaultValue=""
                        onChange={(event) => {
                          const target = event.target.value;
                          if (target) rotateCategoryToTheme(categoryId, target);
                          event.target.value = "";
                        }}
                      >
                        <option value="">Move to…</option>
                        {otherThemes.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeFromTheme(categoryId)}
                      className={`min-h-9 rounded-md border px-2 text-sm ${theme.dangerButton}`}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
            {selectedIds.length === 0 ? (
              <li className={`text-sm ${theme.mutedText}`}>No categories in this theme yet.</li>
            ) : null}
          </ul>
        </div>
      </div>

      {unassigned.length > 0 ? (
        <div className={`mt-6 rounded-md border border-amber-500/40 bg-amber-950/30 p-4`}>
          <p className="text-sm font-medium text-amber-100">Unassigned categories</p>
          <p className="mt-1 text-sm text-amber-200/80">
            Every category must belong to exactly one theme before you can publish.
          </p>
          <ul className="mt-3 space-y-2">
            {unassigned.map((category) => (
              <li
                key={category.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-slate-950/40 px-3 py-2"
              >
                <span className="text-sm">{category.title.en || category.id}</span>
                <select
                  className={`min-h-9 rounded-md border px-2 text-sm ${theme.fieldControl}`}
                  defaultValue=""
                  onChange={(event) => {
                    const target = event.target.value;
                    if (target) assignToTheme(category.id, target);
                    event.target.value = "";
                  }}
                >
                  <option value="">Add to theme…</option>
                  {themeNames.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {onGoToDailyPricing ? (
        <p className={`mt-6 border-t pt-4 text-sm ${theme.divider} ${theme.mutedText}`}>
          Need to change item prices?{" "}
          <button
            type="button"
            onClick={onGoToDailyPricing}
            className="font-medium text-violet-300 underline-offset-2 hover:underline"
          >
            Go to Daily pricing
          </button>
        </p>
      ) : null}
    </div>
  );
}

export function WorkAreaTabs({
  activeTab,
  onTabChange,
  theme,
}: {
  activeTab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  theme: EditorTheme;
}) {
  const tabs: { id: EditorTab; label: string; hint: string }[] = [
    { id: "basic-edit", label: "Edit", hint: "Prices & taxes" },
    { id: "organize-edit", label: "Organize", hint: "Themes & categories" },
    { id: "advanced-setup", label: "Advanced setup", hint: "Full customization" },
  ];

  return (
    <div
      className={`inline-flex flex-wrap gap-1 rounded-lg border p-1 ${theme.cardBorder} bg-slate-950`}
      role="tablist"
      aria-label="Editor mode"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`min-h-10 rounded-md px-4 py-2 text-left text-sm transition ${
            activeTab === tab.id ? theme.tabActive : theme.tabInactive
          }`}
        >
          <span className="block font-medium">{tab.label}</span>
          <span
            className={`block text-xs ${activeTab === tab.id ? "text-violet-100/80" : theme.mutedText}`}
          >
            {tab.hint}
          </span>
        </button>
      ))}
    </div>
  );
}
