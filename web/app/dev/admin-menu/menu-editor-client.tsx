"use client";

import { hasMenuCatalogChanges } from "@/lib/commerce/web-api/staff-order-management/lib/menu-editor-catalog";
import { pollUntilActiveMenuVersion } from "@/lib/commerce/web-api/staff-order-management/lib/poll-active-menu-version";
import type {
  LocalizedText,
  MenuCatalogFile,
  MenuCategory,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  PrintStation,
  SelectionType,
} from "@ricos/shared";
import { useMemo, useRef, useState } from "react";
import {
  collectMenuReadinessIssues,
  type EditorTab,
  type ReadinessIssue,
} from "./menu-editor-readiness";
import { EDITOR_THEME } from "./menu-editor-theme";
import {
  DeferredNumberField,
  MenuStructurePane,
  PublishReadinessBar,
  SelectField,
  StatusBanner,
  TextAreaField,
  TextField,
  VisibilityRuleBuilder,
  WorkAreaTabs,
} from "./menu-editor-panels";

type CommitPublishResult = {
  commitSha?: string;
  commitUrl?: string;
  committedVersion?: number;
  publishedAt?: string;
  baseContentHash?: string;
  error?: string;
};

const HTTP_CONFLICT = 409;
const CENTS_PER_DOLLAR = 100;
const DOLLAR_STEP = "0.05";
const TAX_PERCENT_MULTIPLIER = 100;
const STATIONS: PrintStation[] = ["default", "A", "B"];
const SELECTION_TYPES: SelectionType[] = ["single", "multiple"];

function formatDollars(cents: number): string {
  return (cents / CENTS_PER_DOLLAR).toFixed(2);
}

function parseDollars(value: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.round(numberValue * CENTS_PER_DOLLAR);
}

function formatPercent(rate: number): string {
  return (rate * TAX_PERCENT_MULTIPLIER).toFixed(3).replace(/\.?0+$/, "");
}

function parsePercent(value: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return numberValue / TAX_PERCENT_MULTIPLIER;
}

function slugifyId(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}

function itemDisplayName(item: MenuItem): string {
  return item.name.en.trim() || item.name.es.trim() || item.id;
}

function makeNewItem(existingItems: MenuItem[]): MenuItem {
  const suffix = String(existingItems.length + 1).padStart(2, "0");
  return {
    id: `item_new_${Date.now().toString(36)}_${suffix}`,
    name: { en: "New item", es: "Nuevo articulo" },
    description: { en: "", es: "" },
    priceCents: 0,
    salesTaxRate: 0.105,
    municipalTaxRate: 0.01,
    station: "default",
    modifierGroups: [],
  };
}

function makeModifierGroup(existingGroups: ModifierGroup[] = []): ModifierGroup {
  const suffix = String(existingGroups.length + 1).padStart(2, "0");
  return {
    id: `mod_new_${Date.now().toString(36)}_${suffix}`,
    title: { en: "Choices", es: "Opciones" },
    selectionType: "single",
    required: false,
    minSelections: 0,
    maxSelections: 1,
    options: [],
  };
}

function makeModifierOption(existingOptions: ModifierOption[] = []): ModifierOption {
  const suffix = String(existingOptions.length + 1).padStart(2, "0");
  return {
    id: `opt_new_${Date.now().toString(36)}_${suffix}`,
    label: { en: "New option", es: "Nueva opcion" },
  };
}

function findSelectedItem(menu: MenuCatalogFile, categoryId: string, itemId: string) {
  const category = menu.categories.find((candidate) => candidate.id === categoryId);
  const item = category?.items.find((candidate) => candidate.id === itemId);
  return { category, item };
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildFieldPath(...parts: Array<string | number>): string {
  return parts.join(".");
}

async function readCommitPublishResponse(response: Response): Promise<CommitPublishResult> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as CommitPublishResult;
  } catch {
    return { error: text };
  }
}

function formatPublishSuccessMessage(committedVersion: number | undefined, commitSha?: string): string {
  const versionPart =
    committedVersion !== undefined ? `Catalog v${committedVersion} is live.` : "Catalog is live.";
  if (!commitSha) return versionPart;
  return `${versionPart} Commit ${commitSha.slice(0, 7)}.`;
}

export function AdminMenuEditor({
  initialMenu,
  initialBaseContentHash,
}: {
  initialMenu: MenuCatalogFile;
  initialBaseContentHash: string;
}) {
  const [menu, setMenu] = useState<MenuCatalogFile>(initialMenu);
  const [baselineMenu, setBaselineMenu] = useState<MenuCatalogFile>(initialMenu);
  const [baseContentHash, setBaseContentHash] = useState(initialBaseContentHash);
  const themeNames = Object.keys(initialMenu.themes);
  const [structureTheme, setStructureTheme] = useState(() => themeNames[0] ?? "");
  const [editorTab, setEditorTab] = useState<EditorTab>("basic-edit");
  const firstCategoryId =
    Object.values(initialMenu.themes)[0]?.[0] ?? initialMenu.categories[0]?.id ?? "";
  const firstCategory =
    initialMenu.categories.find((category) => category.id === firstCategoryId) ??
    initialMenu.categories[0];
  const [selectedCategoryId, setSelectedCategoryId] = useState(() => firstCategoryId);
  const [selectedItemId, setSelectedItemId] = useState(
    () => firstCategory?.items[0]?.id ?? "",
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const mainPanelRef = useRef<HTMLElement>(null);

  const hasChanges = useMemo(() => hasMenuCatalogChanges(menu, baselineMenu), [menu, baselineMenu]);
  const readinessIssues = useMemo(() => collectMenuReadinessIssues(menu), [menu]);

  const selected = useMemo(
    () => findSelectedItem(menu, selectedCategoryId, selectedItemId),
    [menu, selectedCategoryId, selectedItemId],
  );
  const selectedBaseline = useMemo(
    () => findSelectedItem(baselineMenu, selectedCategoryId, selectedItemId),
    [baselineMenu, selectedCategoryId, selectedItemId],
  );

  const isSeasonalMode = editorTab === "organize-edit";
  const publishDisabled = busy || (!isSeasonalMode && !selected.item);

  const itemCount = menu.categories.reduce((total, category) => total + category.items.length, 0);
  const theme = EDITOR_THEME;
  const editedItemCount = useMemo(() => {
    let count = 0;
    for (const category of menu.categories) {
      const baselineCategory = baselineMenu.categories.find((candidate) => candidate.id === category.id);
      for (const item of category.items) {
        const baselineItem = baselineCategory?.items.find((candidate) => candidate.id === item.id);
        if (!baselineItem || !valuesEqual(item, baselineItem)) count++;
      }
    }
    return count;
  }, [baselineMenu, menu]);

  const themesChanged = useMemo(
    () => !valuesEqual(menu.themes, baselineMenu.themes),
    [menu.themes, baselineMenu.themes],
  );

  function fieldChanged(path: string, currentValue: unknown): boolean {
    const baselineValue = path.split(".").reduce<unknown>((value, part) => {
      if (value === null || value === undefined) return undefined;
      if (Array.isArray(value)) return value[Number(part)];
      if (typeof value === "object") return (value as Record<string, unknown>)[part];
      return undefined;
    }, selectedBaseline.item);
    return !valuesEqual(currentValue, baselineValue);
  }

  function updateMenu(updater: (current: MenuCatalogFile) => MenuCatalogFile) {
    setMenu(updater);
    setError(null);
    setConflict(false);
  }

  function updateThemes(updater: (themes: MenuCatalogFile["themes"]) => MenuCatalogFile["themes"]) {
    updateMenu((current) => ({ ...current, themes: updater(current.themes) }));
  }

  function updateSelectedItem(updater: (item: MenuItem) => MenuItem) {
    updateMenu((current) => ({
      ...current,
      categories: current.categories.map((category) => {
        if (category.id !== selectedCategoryId) return category;
        return {
          ...category,
          items: category.items.map((item) => (item.id === selectedItemId ? updater(item) : item)),
        };
      }),
    }));
  }

  function updateSelectedItemLocalized(
    field: "name" | "description",
    language: keyof LocalizedText,
    value: string,
  ) {
    updateSelectedItem((item) => ({
      ...item,
      [field]: { ...item[field], [language]: value },
    }));
  }

  function updateModifierGroup(groupIndex: number, updater: (group: ModifierGroup) => ModifierGroup) {
    updateSelectedItem((item) => {
      const modifierGroups = item.modifierGroups ?? [];
      return {
        ...item,
        modifierGroups: modifierGroups.map((group, index) =>
          index === groupIndex ? updater(group) : group,
        ),
      };
    });
  }

  function updateModifierOption(
    groupIndex: number,
    optionIndex: number,
    updater: (option: ModifierOption) => ModifierOption,
  ) {
    updateModifierGroup(groupIndex, (group) => ({
      ...group,
      options: group.options.map((option, index) =>
        index === optionIndex ? updater(option) : option,
      ),
    }));
  }

  function chooseCategory(category: MenuCategory) {
    setSelectedCategoryId(category.id);
    setSelectedItemId(category.items[0]?.id ?? "");
  }

  function jumpToIssue(issue: ReadinessIssue) {
    setEditorTab(issue.tab);
    if (issue.categoryId) setSelectedCategoryId(issue.categoryId);
    if (issue.itemId) setSelectedItemId(issue.itemId);
    if (issue.tab === "organize-edit" && issue.categoryId) {
      const themeForCategory = Object.entries(menu.themes).find(([, ids]) =>
        ids.includes(issue.categoryId!),
      );
      if (themeForCategory) setStructureTheme(themeForCategory[0]);
    }
    requestAnimationFrame(() => {
      mainPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function addItem() {
    if (!selectedCategoryId) return;
    let nextItemId = "";
    updateMenu((current) => ({
      ...current,
      categories: current.categories.map((category) => {
        if (category.id !== selectedCategoryId) return category;
        const newItem = makeNewItem(category.items);
        nextItemId = newItem.id;
        return { ...category, items: [...category.items, newItem] };
      }),
    }));
    if (nextItemId) {
      setSelectedItemId(nextItemId);
      setEditorTab("advanced-setup");
    }
  }

  function removeItem() {
    if (!selectedCategoryId || !selectedItemId) return;
    let nextItemId = "";
    updateMenu((current) => ({
      ...current,
      categories: current.categories.map((category) => {
        if (category.id !== selectedCategoryId) return category;
        const items = category.items.filter((item) => item.id !== selectedItemId);
        nextItemId = items[0]?.id ?? "";
        return { ...category, items };
      }),
    }));
    setSelectedItemId(nextItemId);
  }

  function duplicateItem() {
    if (!selected.item) return;
    const copy: MenuItem = {
      ...selected.item,
      id: `${slugifyId(selected.item.id, "item")}_copy_${Date.now().toString(36)}`,
      name: {
        en: `${selected.item.name.en} copy`.trim(),
        es: `${selected.item.name.es} copia`.trim(),
      },
      modifierGroups: selected.item.modifierGroups
        ? selected.item.modifierGroups.map((group) => ({
            ...group,
            options: group.options.map((option) => ({ ...option, label: { ...option.label } })),
            title: { ...group.title },
          }))
        : undefined,
    };
    updateMenu((current) => ({
      ...current,
      categories: current.categories.map((category) => {
        if (category.id !== selectedCategoryId) return category;
        return { ...category, items: [...category.items, copy] };
      }),
    }));
    setSelectedItemId(copy.id);
  }

  async function commitAndPublish() {
    if (readinessIssues.length > 0) {
      setError(`Fix ${readinessIssues.length} issue(s) before publishing.`);
      setStatus(null);
      jumpToIssue(readinessIssues[0]!);
      return;
    }
    if (!hasMenuCatalogChanges(menu, baselineMenu)) {
      setError("No catalog changes to publish.");
      setStatus(null);
      setConflict(false);
      return;
    }

    setBusy(true);
    setError(null);
    setConflict(false);
    setStatus("Committing to menu repository...");
    try {
      const response = await fetch("/api/staff/admin/menu/commit-publish", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ menu, baseContentHash }),
      });
      const body = await readCommitPublishResponse(response);
      if (!response.ok) {
        const isConflict = response.status === HTTP_CONFLICT;
        setConflict(isConflict);
        setError(
          isConflict
            ? (body.error ??
                "Someone else published a newer menu. Refresh to discard your changes and start again.")
            : (body.error ?? `HTTP ${response.status}`),
        );
        setStatus(null);
        return;
      }

      const committedVersion = body.committedVersion;
      const publishedAt = body.publishedAt;
      if (committedVersion === undefined) {
        setError("Publish succeeded but committedVersion was missing.");
        setStatus(null);
        return;
      }

      setStatus(`Waiting for live menu (v${committedVersion})...`);
      await pollUntilActiveMenuVersion(committedVersion);

      if (publishedAt) {
        const updatedMenu = {
          ...menu,
          catalogVersion: committedVersion,
          publishedAt,
        };
        setMenu(updatedMenu);
        setBaselineMenu(updatedMenu);
      }
      if (body.baseContentHash) setBaseContentHash(body.baseContentHash);

      setError(null);
      setStatus(formatPublishSuccessMessage(committedVersion, body.commitSha));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`min-h-dvh px-4 py-6 sm:px-6 lg:px-8 ${theme.page}`}>
      <div className="mx-auto max-w-7xl">
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

        <div
          className={`mt-5 grid gap-5 ${isSeasonalMode ? "grid-cols-1" : "lg:grid-cols-[330px_minmax(0,1fr)]"}`}
        >
          {!isSeasonalMode ? (
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
                                selectedItemId === item.id
                                  ? theme.itemButtonActive
                                  : theme.itemButton
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
          ) : null}

          <section ref={mainPanelRef} className="min-w-0 space-y-5">
            {status ? <StatusBanner tone="success">{status}</StatusBanner> : null}
            {error ? (
              <div className="space-y-3">
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
              </div>
            ) : null}

            {isSeasonalMode ? (
              <MenuStructurePane
                menu={menu}
                theme={theme}
                selectedTheme={structureTheme || (themeNames[0] ?? "")}
                onSelectTheme={setStructureTheme}
                onUpdateThemes={updateThemes}
                onGoToDailyPricing={() => setEditorTab("basic-edit")}
              />
            ) : null}

            {editorTab !== "organize-edit" && selected.item ? (
              <>
                <div className={`overflow-hidden rounded-lg border ${theme.panel}`}>
                  <div className="border-l-4 border-violet-500 px-5 py-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${theme.accentText}`}>
                          {selected.category?.title.en ?? "Category"}
                        </p>
                        <h2 className={`mt-1 truncate text-2xl font-normal ${theme.strongText}`}>
                          {itemDisplayName(selected.item)}
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

                {editorTab === "basic-edit" ? (
                  <div className={`rounded-lg border p-5 ${theme.panel}`}>
                    <h3 className={`text-base font-medium ${theme.strongText}`}>Pricing</h3>
                    <div className="mt-5 grid gap-5 md:grid-cols-2">
                      <TextField
                        label="Name (English)"
                        value={selected.item.name.en}
                        onChange={(value) => updateSelectedItemLocalized("name", "en", value)}
                        theme={theme}
                        changed={fieldChanged("name.en", selected.item.name.en)}
                      />
                      <TextField
                        label="Name (Spanish)"
                        value={selected.item.name.es}
                        onChange={(value) => updateSelectedItemLocalized("name", "es", value)}
                        theme={theme}
                        changed={fieldChanged("name.es", selected.item.name.es)}
                      />
                      <DeferredNumberField
                        label="Price"
                        numericValue={selected.item.priceCents}
                        format={formatDollars}
                        parse={parseDollars}
                        step={DOLLAR_STEP}
                        onChange={(priceCents) =>
                          updateSelectedItem((item) => ({ ...item, priceCents }))
                        }
                        theme={theme}
                        changed={fieldChanged("priceCents", selected.item.priceCents)}
                      />
                      <SelectField
                        label="Kitchen station"
                        value={selected.item.station}
                        options={STATIONS}
                        onChange={(value) => updateSelectedItem((item) => ({ ...item, station: value }))}
                        theme={theme}
                        changed={fieldChanged("station", selected.item.station)}
                      />
                      <DeferredNumberField
                        label="Sales tax %"
                        numericValue={selected.item.salesTaxRate}
                        format={formatPercent}
                        parse={parsePercent}
                        step="0.001"
                        onChange={(salesTaxRate) =>
                          updateSelectedItem((item) => ({ ...item, salesTaxRate }))
                        }
                        theme={theme}
                        changed={fieldChanged("salesTaxRate", selected.item.salesTaxRate)}
                      />
                      <DeferredNumberField
                        label="Municipal tax %"
                        numericValue={selected.item.municipalTaxRate}
                        format={formatPercent}
                        parse={parsePercent}
                        step="0.001"
                        onChange={(municipalTaxRate) =>
                          updateSelectedItem((item) => ({ ...item, municipalTaxRate }))
                        }
                        theme={theme}
                        changed={fieldChanged("municipalTaxRate", selected.item.municipalTaxRate)}
                      />
                    </div>
                    <p className={`mt-4 text-sm ${theme.mutedText}`}>
                      Need choices, descriptions, or conditional sides? Switch to{" "}
                      <button
                        type="button"
                        onClick={() => setEditorTab("advanced-setup")}
                        className="font-medium text-violet-300 underline-offset-2 hover:underline"
                      >
                        Advanced setup
                      </button>
                      .
                    </p>
                  </div>
                ) : null}

                {editorTab === "advanced-setup" ? (
                  <>
                    <div className={`rounded-lg border p-5 ${theme.panel}`}>
                      <h3 className={`text-base font-medium ${theme.strongText}`}>Item details</h3>
                      <div className="mt-5 grid gap-5 md:grid-cols-2">
                        <TextField
                          label="English name"
                          value={selected.item.name.en}
                          onChange={(value) => updateSelectedItemLocalized("name", "en", value)}
                          theme={theme}
                          changed={fieldChanged("name.en", selected.item.name.en)}
                        />
                        <TextField
                          label="Spanish name"
                          value={selected.item.name.es}
                          onChange={(value) => updateSelectedItemLocalized("name", "es", value)}
                          theme={theme}
                          changed={fieldChanged("name.es", selected.item.name.es)}
                        />
                        <TextAreaField
                          label="English description"
                          value={selected.item.description.en}
                          onChange={(value) =>
                            updateSelectedItemLocalized("description", "en", value)
                          }
                          theme={theme}
                          changed={fieldChanged("description.en", selected.item.description.en)}
                        />
                        <TextAreaField
                          label="Spanish description"
                          value={selected.item.description.es}
                          onChange={(value) =>
                            updateSelectedItemLocalized("description", "es", value)
                          }
                          theme={theme}
                          changed={fieldChanged("description.es", selected.item.description.es)}
                        />
                        <TextField
                          label="Item ID (internal)"
                          value={selected.item.id}
                          onChange={(value) => {
                            setSelectedItemId(value);
                            updateSelectedItem((item) => ({ ...item, id: value }));
                          }}
                          theme={theme}
                          changed={fieldChanged("id", selected.item.id)}
                        />
                        <SelectField
                          label="Kitchen station"
                          value={selected.item.station}
                          options={STATIONS}
                          onChange={(value) =>
                            updateSelectedItem((item) => ({ ...item, station: value }))
                          }
                          theme={theme}
                          changed={fieldChanged("station", selected.item.station)}
                        />
                        <DeferredNumberField
                          label="Price"
                          numericValue={selected.item.priceCents}
                          format={formatDollars}
                          parse={parseDollars}
                          step={DOLLAR_STEP}
                          onChange={(priceCents) =>
                            updateSelectedItem((item) => ({ ...item, priceCents }))
                          }
                          theme={theme}
                          changed={fieldChanged("priceCents", selected.item.priceCents)}
                        />
                        <div className="grid gap-5 sm:grid-cols-2">
                          <DeferredNumberField
                            label="Sales tax %"
                            numericValue={selected.item.salesTaxRate}
                            format={formatPercent}
                            parse={parsePercent}
                            step="0.001"
                            onChange={(salesTaxRate) =>
                              updateSelectedItem((item) => ({ ...item, salesTaxRate }))
                            }
                            theme={theme}
                            changed={fieldChanged("salesTaxRate", selected.item.salesTaxRate)}
                          />
                          <DeferredNumberField
                            label="Municipal tax %"
                            numericValue={selected.item.municipalTaxRate}
                            format={formatPercent}
                            parse={parsePercent}
                            step="0.001"
                            onChange={(municipalTaxRate) =>
                              updateSelectedItem((item) => ({ ...item, municipalTaxRate }))
                            }
                            theme={theme}
                            changed={fieldChanged(
                              "municipalTaxRate",
                              selected.item.municipalTaxRate,
                            )}
                          />
                        </div>
                      </div>
                    </div>

                    <div className={`rounded-lg border p-5 ${theme.panel}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className={`text-base font-medium ${theme.strongText}`}>
                            Choices and add-ons
                          </h3>
                          <p className={`mt-1 text-sm ${theme.mutedText}`}>
                            Sizes, sides, toppings, and extra charges.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedItem((item) => ({
                              ...item,
                              modifierGroups: [
                                ...(item.modifierGroups ?? []),
                                makeModifierGroup(item.modifierGroups),
                              ],
                            }))
                          }
                          className={`min-h-10 rounded-md border px-3 text-sm font-medium ${theme.softButton}`}
                        >
                          Add choice group
                        </button>
                      </div>

                      <div className="mt-5 space-y-5">
                        {(selected.item.modifierGroups ?? []).map((group, groupIndex) => {
                          const groupPath = buildFieldPath("modifierGroups", groupIndex);
                          const groupChanged = fieldChanged(groupPath, group);
                          const allGroups = selected.item?.modifierGroups ?? [];
                          return (
                            <section
                              key={`${group.id}-${groupIndex}`}
                              className={`rounded-lg border p-4 ${
                                groupChanged ? theme.changedPanel : theme.cardBorder
                              }`}
                            >
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="grid flex-1 gap-4 md:grid-cols-2">
                                  <TextField
                                    label="Group title (English)"
                                    value={group.title.en}
                                    onChange={(value) =>
                                      updateModifierGroup(groupIndex, (current) => ({
                                        ...current,
                                        title: { ...current.title, en: value },
                                      }))
                                    }
                                    theme={theme}
                                    changed={fieldChanged(
                                      buildFieldPath(groupPath, "title", "en"),
                                      group.title.en,
                                    )}
                                  />
                                  <TextField
                                    label="Group title (Spanish)"
                                    value={group.title.es}
                                    onChange={(value) =>
                                      updateModifierGroup(groupIndex, (current) => ({
                                        ...current,
                                        title: { ...current.title, es: value },
                                      }))
                                    }
                                    theme={theme}
                                    changed={fieldChanged(
                                      buildFieldPath(groupPath, "title", "es"),
                                      group.title.es,
                                    )}
                                  />
                                  <TextField
                                    label="Group ID (internal)"
                                    value={group.id}
                                    onChange={(value) =>
                                      updateModifierGroup(groupIndex, (current) => ({
                                        ...current,
                                        id: value,
                                      }))
                                    }
                                    theme={theme}
                                    changed={fieldChanged(buildFieldPath(groupPath, "id"), group.id)}
                                  />
                                  <SelectField
                                    label="Pick one or many"
                                    value={group.selectionType}
                                    options={SELECTION_TYPES}
                                    optionLabels={{
                                      single: "Pick one",
                                      multiple: "Pick many",
                                    }}
                                    onChange={(value) =>
                                      updateModifierGroup(groupIndex, (current) => ({
                                        ...current,
                                        selectionType: value,
                                      }))
                                    }
                                    theme={theme}
                                    changed={fieldChanged(
                                      buildFieldPath(groupPath, "selectionType"),
                                      group.selectionType,
                                    )}
                                  />
                                  <DeferredNumberField
                                    label="Minimum picks"
                                    numericValue={group.minSelections}
                                    format={(value) => String(value)}
                                    parse={(value) => Number.parseInt(value, 10) || 0}
                                    step="1"
                                    onChange={(minSelections) =>
                                      updateModifierGroup(groupIndex, (current) => ({
                                        ...current,
                                        minSelections,
                                      }))
                                    }
                                    theme={theme}
                                    changed={fieldChanged(
                                      buildFieldPath(groupPath, "minSelections"),
                                      group.minSelections,
                                    )}
                                  />
                                  <DeferredNumberField
                                    label="Maximum picks"
                                    numericValue={group.maxSelections}
                                    format={(value) => String(value)}
                                    parse={(value) => Number.parseInt(value, 10) || 0}
                                    step="1"
                                    onChange={(maxSelections) =>
                                      updateModifierGroup(groupIndex, (current) => ({
                                        ...current,
                                        maxSelections,
                                      }))
                                    }
                                    theme={theme}
                                    changed={fieldChanged(
                                      buildFieldPath(groupPath, "maxSelections"),
                                      group.maxSelections,
                                    )}
                                  />
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-2">
                                  <label
                                    className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm ${
                                      fieldChanged(
                                        buildFieldPath(groupPath, "required"),
                                        group.required,
                                      )
                                        ? `${theme.changedPanel} ${theme.changedText}`
                                        : theme.checkboxShell
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={group.required}
                                      onChange={(event) =>
                                        updateModifierGroup(groupIndex, (current) => ({
                                          ...current,
                                          required: event.target.checked,
                                        }))
                                      }
                                      className="h-4 w-4 accent-violet-600"
                                    />
                                    Required
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateSelectedItem((item) => ({
                                        ...item,
                                        modifierGroups: (item.modifierGroups ?? []).filter(
                                          (_, index) => index !== groupIndex,
                                        ),
                                      }))
                                    }
                                    className={`min-h-10 rounded-md border px-3 text-sm font-medium ${theme.dangerButton}`}
                                  >
                                    Remove group
                                  </button>
                                </div>
                              </div>

                              <VisibilityRuleBuilder
                                group={group}
                                groupIndex={groupIndex}
                                allGroups={allGroups}
                                theme={theme}
                                changed={Boolean(
                                  group.visibleWhen &&
                                    fieldChanged(
                                      buildFieldPath(groupPath, "visibleWhen"),
                                      group.visibleWhen,
                                    ),
                                )}
                                onUpdate={(updater) =>
                                  updateModifierGroup(groupIndex, updater)
                                }
                              />

                              <div className="mt-5 space-y-3">
                                {group.options.map((option, optionIndex) => {
                                  const optionPath = buildFieldPath(
                                    groupPath,
                                    "options",
                                    optionIndex,
                                  );
                                  const optionChanged = fieldChanged(optionPath, option);
                                  return (
                                    <div
                                      key={`${option.id}-${optionIndex}`}
                                      className={`grid gap-3 rounded-md border p-3 lg:grid-cols-[1fr_1fr_1fr_150px_auto] ${
                                        optionChanged ? theme.changedPanel : theme.nestedPanel
                                      }`}
                                    >
                                      <TextField
                                        label="Option (English)"
                                        value={option.label.en}
                                        onChange={(value) =>
                                          updateModifierOption(groupIndex, optionIndex, (current) => ({
                                            ...current,
                                            label: { ...current.label, en: value },
                                          }))
                                        }
                                        theme={theme}
                                        changed={fieldChanged(
                                          buildFieldPath(optionPath, "label", "en"),
                                          option.label.en,
                                        )}
                                      />
                                      <TextField
                                        label="Option (Spanish)"
                                        value={option.label.es}
                                        onChange={(value) =>
                                          updateModifierOption(groupIndex, optionIndex, (current) => ({
                                            ...current,
                                            label: { ...current.label, es: value },
                                          }))
                                        }
                                        theme={theme}
                                        changed={fieldChanged(
                                          buildFieldPath(optionPath, "label", "es"),
                                          option.label.es,
                                        )}
                                      />
                                      <TextField
                                        label="Option ID (internal)"
                                        value={option.id}
                                        onChange={(value) =>
                                          updateModifierOption(groupIndex, optionIndex, (current) => ({
                                            ...current,
                                            id: value,
                                          }))
                                        }
                                        theme={theme}
                                        changed={fieldChanged(
                                          buildFieldPath(optionPath, "id"),
                                          option.id,
                                        )}
                                      />
                                      <DeferredNumberField
                                        label="Extra price"
                                        numericValue={option.priceDeltaCents ?? 0}
                                        format={formatDollars}
                                        parse={parseDollars}
                                        step={DOLLAR_STEP}
                                        onChange={(priceDeltaCents) =>
                                          updateModifierOption(groupIndex, optionIndex, (current) => {
                                            if (priceDeltaCents === 0) {
                                              const withoutPrice: ModifierOption = {
                                                id: current.id,
                                                label: current.label,
                                              };
                                              return withoutPrice;
                                            }
                                            return { ...current, priceDeltaCents };
                                          })
                                        }
                                        theme={theme}
                                        changed={fieldChanged(
                                          buildFieldPath(optionPath, "priceDeltaCents"),
                                          option.priceDeltaCents,
                                        )}
                                      />
                                      <div className="flex items-end">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateModifierGroup(groupIndex, (current) => ({
                                              ...current,
                                              options: current.options.filter(
                                                (_, index) => index !== optionIndex,
                                              ),
                                            }))
                                          }
                                          className={`min-h-10 w-full rounded-md border px-3 text-sm font-medium ${theme.dangerButton}`}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  updateModifierGroup(groupIndex, (current) => ({
                                    ...current,
                                    options: [...current.options, makeModifierOption(current.options)],
                                  }))
                                }
                                className={`mt-4 min-h-10 rounded-md border px-3 text-sm font-medium ${theme.softButton}`}
                              >
                                Add option
                              </button>
                            </section>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}

            {editorTab !== "organize-edit" && !selected.item ? (
              <StatusBanner tone="neutral">Select or add an item to start editing.</StatusBanner>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
