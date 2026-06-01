"use client";

import { hasMenuCatalogChanges } from "@/lib/commerce/web-api/staff-order-management/lib/menu-editor-catalog";
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
import { useMemo, useState } from "react";

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

type ThemeMode = "light" | "dark";

type ThemeClasses = {
  page: string;
  panel: string;
  nestedPanel: string;
  fieldLabel: string;
  fieldControl: string;
  mutedText: string;
  strongText: string;
  regularText: string;
  cardBorder: string;
  softButton: string;
  neutralButton: string;
  dangerButton: string;
  itemButton: string;
  itemButtonActive: string;
  categoryButton: string;
  categoryButtonActive: string;
  divider: string;
  checkboxShell: string;
  changedField: string;
  changedPanel: string;
  changedText: string;
};

const THEME_CLASSES: Record<ThemeMode, ThemeClasses> = {
  light: {
    page: "bg-[#f8fafd] text-slate-950",
    panel: "border-slate-200 bg-white shadow-sm",
    nestedPanel: "border-slate-200 bg-slate-50",
    fieldLabel: "text-slate-700",
    fieldControl:
      "border-slate-300 bg-white text-slate-950 focus:border-violet-600 focus:ring-violet-100",
    mutedText: "text-slate-500",
    strongText: "text-slate-950",
    regularText: "text-slate-700",
    cardBorder: "border-slate-200",
    softButton: "border-violet-200 text-violet-700 hover:bg-violet-50 disabled:text-slate-400",
    neutralButton: "border-slate-300 text-slate-700 hover:bg-slate-50",
    dangerButton: "border-red-200 text-red-700 hover:bg-red-50",
    itemButton: "text-slate-600 hover:bg-slate-50",
    itemButtonActive: "bg-slate-100 text-slate-950",
    categoryButton: "text-slate-700 hover:bg-slate-50",
    categoryButtonActive: "border-l-4 border-violet-600 bg-violet-50 text-violet-950",
    divider: "border-slate-200",
    checkboxShell: "border-slate-300 text-slate-700",
    changedField: "border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-100",
    changedPanel: "border-amber-300 bg-amber-50/60",
    changedText: "text-amber-700",
  },
  dark: {
    page: "bg-slate-950 text-slate-100",
    panel: "border-slate-700 bg-slate-900 shadow-sm shadow-black/20",
    nestedPanel: "border-slate-700 bg-slate-950/60",
    fieldLabel: "text-slate-200",
    fieldControl:
      "border-slate-600 bg-slate-950 text-slate-100 focus:border-violet-400 focus:ring-violet-500/20",
    mutedText: "text-slate-400",
    strongText: "text-slate-50",
    regularText: "text-slate-300",
    cardBorder: "border-slate-700",
    softButton: "border-violet-500/50 text-violet-200 hover:bg-violet-500/10 disabled:text-slate-500",
    neutralButton: "border-slate-600 text-slate-200 hover:bg-slate-800",
    dangerButton: "border-red-500/50 text-red-200 hover:bg-red-500/10",
    itemButton: "text-slate-300 hover:bg-slate-800",
    itemButtonActive: "bg-slate-800 text-slate-50",
    categoryButton: "text-slate-300 hover:bg-slate-800",
    categoryButtonActive: "border-l-4 border-violet-400 bg-violet-500/15 text-violet-100",
    divider: "border-slate-700",
    checkboxShell: "border-slate-600 text-slate-200",
    changedField:
      "border-amber-400 bg-amber-950/40 text-amber-50 focus:border-amber-300 focus:ring-amber-400/20",
    changedPanel: "border-amber-400/70 bg-amber-950/20",
    changedText: "text-amber-200",
  },
};

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

function StatusBanner({
  tone,
  theme,
  children,
}: {
  tone: "error" | "success" | "neutral";
  theme: ThemeMode;
  children: React.ReactNode;
}) {
  const className = {
    light: {
      error: "border-red-200 bg-red-50 text-red-800",
      success: "border-emerald-200 bg-emerald-50 text-emerald-800",
      neutral: "border-blue-200 bg-blue-50 text-blue-800",
    },
    dark: {
      error: "border-red-500/40 bg-red-950/40 text-red-100",
      success: "border-emerald-500/40 bg-emerald-950/40 text-emerald-100",
      neutral: "border-blue-500/40 bg-blue-950/40 text-blue-100",
    },
  }[theme][tone];
  return (
    <p
      className={`rounded-md border px-4 py-3 text-sm ${className}`}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </p>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  theme,
  changed = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  theme: ThemeClasses;
  changed?: boolean;
  type?: "text" | "number";
}) {
  return (
    <label className="block">
      <span className={`text-sm font-medium ${changed ? theme.changedText : theme.fieldLabel}`}>
        {label}
        {changed ? <span className="ml-2 text-xs font-semibold">Edited</span> : null}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 h-12 w-full rounded-md border px-3 text-[15px] outline-none transition focus:ring-2 ${
          changed ? theme.changedField : theme.fieldControl
        }`}
      />
    </label>
  );
}

function DeferredNumberField({
  label,
  numericValue,
  format,
  parse,
  onChange,
  placeholder,
  theme,
  changed = false,
  step,
}: {
  label: string;
  numericValue: number;
  format: (value: number) => string;
  parse: (value: string) => number;
  onChange: (value: number) => void;
  placeholder?: string;
  theme: ThemeClasses;
  changed?: boolean;
  step?: string;
}) {
  const [draft, setDraft] = useState(() => format(numericValue));
  const [isEditing, setIsEditing] = useState(false);

  function commitDraft() {
    const parsed = parse(draft);
    onChange(parsed);
    setDraft(format(parsed));
  }

  return (
    <label className="block">
      <span className={`text-sm font-medium ${changed ? theme.changedText : theme.fieldLabel}`}>
        {label}
        {changed ? <span className="ml-2 text-xs font-semibold">Edited</span> : null}
      </span>
      <input
        type="number"
        step={step}
        value={isEditing ? draft : format(numericValue)}
        placeholder={placeholder}
        onFocus={() => {
          setIsEditing(true);
          setDraft(format(numericValue));
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setIsEditing(false);
          commitDraft();
        }}
        className={`mt-2 h-12 w-full rounded-md border px-3 text-[15px] outline-none transition focus:ring-2 ${
          changed ? theme.changedField : theme.fieldControl
        }`}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  theme,
  changed = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  theme: ThemeClasses;
  changed?: boolean;
}) {
  return (
    <label className="block">
      <span className={`text-sm font-medium ${changed ? theme.changedText : theme.fieldLabel}`}>
        {label}
        {changed ? <span className="ml-2 text-xs font-semibold">Edited</span> : null}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className={`mt-2 w-full resize-y rounded-md border px-3 py-3 text-[15px] leading-6 outline-none transition focus:ring-2 ${
          changed ? theme.changedField : theme.fieldControl
        }`}
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  theme,
  changed = false,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (value: T) => void;
  theme: ThemeClasses;
  changed?: boolean;
}) {
  return (
    <label className="block">
      <span className={`text-sm font-medium ${changed ? theme.changedText : theme.fieldLabel}`}>
        {label}
        {changed ? <span className="ml-2 text-xs font-semibold">Edited</span> : null}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={`mt-2 h-12 w-full rounded-md border px-3 text-[15px] outline-none transition focus:ring-2 ${
          changed ? theme.changedField : theme.fieldControl
        }`}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
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
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    () => initialMenu.categories[0]?.id ?? "",
  );
  const [selectedItemId, setSelectedItemId] = useState(
    () => initialMenu.categories[0]?.items[0]?.id ?? "",
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasChanges = useMemo(() => hasMenuCatalogChanges(menu, baselineMenu), [menu, baselineMenu]);

  const selected = useMemo(
    () => findSelectedItem(menu, selectedCategoryId, selectedItemId),
    [menu, selectedCategoryId, selectedItemId],
  );
  const selectedBaseline = useMemo(
    () => findSelectedItem(baselineMenu, selectedCategoryId, selectedItemId),
    [baselineMenu, selectedCategoryId, selectedItemId],
  );

  const publishDisabled = busy || !selected.item;

  const itemCount = menu.categories.reduce((total, category) => total + category.items.length, 0);
  const theme = THEME_CLASSES[themeMode];
  const editedFieldCount = useMemo(() => {
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

  function fieldChanged(path: string, currentValue: unknown): boolean {
    const baselineValue = path.split(".").reduce<unknown>((value, part) => {
      if (value === null || value === undefined) return undefined;
      if (Array.isArray(value)) return value[Number(part)];
      if (typeof value === "object") return (value as Record<string, unknown>)[part];
      return undefined;
    }, selectedBaseline.item);
    return !valuesEqual(currentValue, baselineValue);
  }

  function updateSelectedItem(updater: (item: MenuItem) => MenuItem) {
    setMenu((current) => ({
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

  function addItem() {
    if (!selectedCategoryId) return;
    setError(null);
    setConflict(false);
    let nextItemId = "";
    setMenu((current) => ({
      ...current,
      categories: current.categories.map((category) => {
        if (category.id !== selectedCategoryId) return category;
        const newItem = makeNewItem(category.items);
        nextItemId = newItem.id;
        return { ...category, items: [...category.items, newItem] };
      }),
    }));
    if (nextItemId) setSelectedItemId(nextItemId);
  }

  function removeItem() {
    if (!selectedCategoryId || !selectedItemId) return;
    setError(null);
    setConflict(false);
    let nextItemId = "";
    setMenu((current) => ({
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
    setMenu((current) => ({
      ...current,
      categories: current.categories.map((category) => {
        if (category.id !== selectedCategoryId) return category;
        return { ...category, items: [...category.items, copy] };
      }),
    }));
    setSelectedItemId(copy.id);
  }

  async function commitAndPublish() {
    if (!hasMenuCatalogChanges(menu, baselineMenu)) {
      setError("No catalog changes to publish.");
      setStatus(null);
      setConflict(false);
      return;
    }

    setBusy(true);
    setError(null);
    setConflict(false);
    setStatus("Committing and verifying the live catalog...");
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
      if (committedVersion && publishedAt) {
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
      setStatus(formatPublishSuccessMessage(body.committedVersion, body.commitSha));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  const publishButtonLabel = busy ? "Publishing..." : "Commit & publish";

  return (
    <main className={`min-h-dvh px-4 py-6 sm:px-6 lg:px-8 ${theme.page}`}>
      <div className="mx-auto max-w-7xl">
        <header className={`overflow-hidden rounded-lg border ${theme.panel}`}>
          <div className="h-2 bg-violet-600" />
          <div className="flex flex-col gap-5 px-5 py-5 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-violet-700">RicoS catalog</p>
              <h1 className={`mt-1 text-2xl font-normal tracking-normal ${theme.strongText}`}>
                Menu editor
              </h1>
              <p className={`mt-2 text-sm ${theme.mutedText}`}>
                {itemCount} items across {menu.categories.length} categories
                {editedFieldCount > 0 ? (
                  <span className={`ml-3 font-medium ${theme.changedText}`}>
                    {editedFieldCount} changed
                  </span>
                ) : null}
              </p>
              <div className={`mt-4 max-w-3xl rounded-md border px-4 py-3 text-sm leading-6 ${theme.nestedPanel}`}>
                <p className={theme.regularText}>
                  Before publishing, make sure every item has a clear name, description, price,
                  tax, and kitchen station. Review choice groups and extra prices, then press
                  <span className="font-medium"> Commit & publish</span> once. The live menu updates
                  after Vercel finishes deploying the commit.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div
                className={`inline-flex rounded-full border p-1 ${theme.cardBorder} ${
                  themeMode === "dark" ? "bg-slate-950" : "bg-slate-100"
                }`}
                aria-label="Color mode"
              >
                {(["light", "dark"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setThemeMode(mode)}
                    className={`min-h-9 rounded-full px-4 text-sm font-medium capitalize transition ${
                      themeMode === mode
                        ? "bg-violet-600 text-white shadow-sm"
                        : `${theme.regularText} hover:bg-violet-500/10`
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={publishDisabled}
                onClick={() => void commitAndPublish()}
                className="min-h-11 rounded-md bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
              >
                {publishButtonLabel}
              </button>
            </div>
          </div>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside className={`min-w-0 rounded-lg border p-4 ${theme.panel}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className={`text-base font-medium ${theme.strongText}`}>Catalog items</h2>
                <p className={`mt-1 text-xs ${theme.mutedText}`}>Choose an item to edit.</p>
              </div>
              <button
                type="button"
                disabled={!selectedCategoryId}
                onClick={addItem}
                className={`min-h-9 rounded-md border px-3 text-sm font-medium ${theme.softButton}`}
              >
                Add item
              </button>
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

          <section className="min-w-0 space-y-5">
            {status ? <StatusBanner tone="success" theme={themeMode}>{status}</StatusBanner> : null}
            {error ? (
              <div className="space-y-3">
                <StatusBanner tone="error" theme={themeMode}>{error}</StatusBanner>
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

            {selected.item ? (
              <>
                <div className={`overflow-hidden rounded-lg border ${theme.panel}`}>
                  <div className="border-l-4 border-violet-600 px-5 py-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-violet-700">
                          {selected.category?.title.en ?? "Category"}
                        </p>
                        <h2 className={`mt-1 truncate text-2xl font-normal ${theme.strongText}`}>
                          {itemDisplayName(selected.item)}
                        </h2>
                        <p className={`mt-2 text-sm ${theme.mutedText}`}>
                          Edit this item the same way it appears in the ordering catalog.
                        </p>
                      </div>
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
                    </div>
                  </div>
                </div>

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
                      onChange={(value) => updateSelectedItemLocalized("description", "en", value)}
                      theme={theme}
                      changed={fieldChanged("description.en", selected.item.description.en)}
                    />
                    <TextAreaField
                      label="Spanish description"
                      value={selected.item.description.es}
                      onChange={(value) => updateSelectedItemLocalized("description", "es", value)}
                      theme={theme}
                      changed={fieldChanged("description.es", selected.item.description.es)}
                    />
                    <TextField
                      label="Item ID"
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
                      onChange={(value) => updateSelectedItem((item) => ({ ...item, station: value }))}
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
                        changed={fieldChanged("municipalTaxRate", selected.item.municipalTaxRate)}
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
                        Examples: pancake or waffle, sides, toppings, extra charges.
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
                              label="Group title English"
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
                              label="Group title Spanish"
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
                              label="Group ID"
                              value={group.id}
                              onChange={(value) =>
                                updateModifierGroup(groupIndex, (current) => ({ ...current, id: value }))
                              }
                              theme={theme}
                              changed={fieldChanged(buildFieldPath(groupPath, "id"), group.id)}
                            />
                            <SelectField
                              label="Selection type"
                              value={group.selectionType}
                              options={SELECTION_TYPES}
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
                              label="Minimum selections"
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
                              label="Maximum selections"
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
                                fieldChanged(buildFieldPath(groupPath, "required"), group.required)
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

                        <div className="mt-5 space-y-3">
                          {group.options.map((option, optionIndex) => {
                            const optionPath = buildFieldPath(groupPath, "options", optionIndex);
                            const optionChanged = fieldChanged(optionPath, option);
                            return (
                            <div
                              key={`${option.id}-${optionIndex}`}
                              className={`grid gap-3 rounded-md border p-3 lg:grid-cols-[1fr_1fr_1fr_150px_auto] ${
                                optionChanged ? theme.changedPanel : theme.nestedPanel
                              }`}
                            >
                              <TextField
                                label="Option English"
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
                                label="Option Spanish"
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
                                label="Option ID"
                                value={option.id}
                                onChange={(value) =>
                                  updateModifierOption(groupIndex, optionIndex, (current) => ({
                                    ...current,
                                    id: value,
                                  }))
                                }
                                theme={theme}
                                changed={fieldChanged(buildFieldPath(optionPath, "id"), option.id)}
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
            ) : (
              <StatusBanner tone="neutral" theme={themeMode}>
                Select or add an item to start editing.
              </StatusBanner>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
