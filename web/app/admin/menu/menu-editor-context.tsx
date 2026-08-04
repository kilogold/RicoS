"use client";

import { hasMenuCatalogChanges } from "@/lib/commerce/web-api/staff-order-management/lib/menu-editor-catalog";
import type {
  LocalizedText,
  MenuCatalogFile,
  MenuCategory,
  MenuItem,
  ModifierGroup,
  ModifierOption,
} from "@ricos/shared";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { commitMenuCatalog } from "./menu-editor-publish";
import {
  collectMenuReadinessIssues,
  type EditorTab,
  type ReadinessIssue,
} from "./menu-editor-readiness";
import { EDITOR_THEME, type EditorTheme } from "./menu-editor-theme";
import {
  countEditedItems,
  findSelectedItem,
  initialEditorSelection,
  makeNewItem,
  canDeleteCategory as canDeleteCategoryFromMenu,
  canDeleteTheme as canDeleteThemeFromMenu,
  makeNewCategory,
  slugifyId,
  valuesEqual,
} from "./menu-editor-utils";

type MenuEditorContextValue = {
  theme: EditorTheme;
  menu: MenuCatalogFile;
  baselineMenu: MenuCatalogFile;
  editorTab: EditorTab;
  setEditorTab: (tab: EditorTab) => void;
  isOrganizeMode: boolean;
  structureTheme: string;
  setStructureTheme: (theme: string) => void;
  selectedCategoryId: string;
  selectedItemId: string;
  setSelectedItemId: (id: string) => void;
  selected: ReturnType<typeof findSelectedItem>;
  itemCount: number;
  editedItemCount: number;
  themesChanged: boolean;
  hasChanges: boolean;
  readinessIssues: ReadinessIssue[];
  publishDisabled: boolean;
  busy: boolean;
  status: string | null;
  error: string | null;
  conflict: boolean;
  mainPanelRef: RefObject<HTMLElement | null>;
  fieldChanged: (path: string, currentValue: unknown) => boolean;
  chooseCategory: (category: MenuCategory) => void;
  jumpToIssue: (issue: ReadinessIssue) => void;
  commitAndPublish: () => Promise<void>;
  updateThemes: (updater: (themes: MenuCatalogFile["themes"]) => MenuCatalogFile["themes"]) => void;
  updateCategoryTitle: (categoryId: string, language: keyof LocalizedText, value: string) => void;
  categoryTitleChanged: (categoryId: string, language: keyof LocalizedText, value: string) => boolean;
  updateSelectedItem: (updater: (item: MenuItem) => MenuItem) => void;
  updateSelectedItemLocalized: (
    field: "name" | "description",
    language: keyof LocalizedText,
    value: string,
  ) => void;
  updateModifierGroup: (groupIndex: number, updater: (group: ModifierGroup) => ModifierGroup) => void;
  updateModifierOption: (
    groupIndex: number,
    optionIndex: number,
    updater: (option: ModifierOption) => ModifierOption,
  ) => void;
  addItem: () => void;
  addCategoryToTheme: (themeName: string) => void;
  addTheme: (themeName: string) => string | null;
  removeTheme: (themeName: string) => void;
  canDeleteTheme: (themeName: string) => boolean;
  deleteCategory: (categoryId: string) => void;
  canDeleteCategory: (categoryId: string) => boolean;
  removeItem: () => void;
  duplicateItem: () => void;
};

const MenuEditorContext = createContext<MenuEditorContextValue | null>(null);

export function useMenuEditor(): MenuEditorContextValue {
  const value = useContext(MenuEditorContext);
  if (!value) {
    throw new Error("useMenuEditor must be used within MenuEditorProvider");
  }
  return value;
}

export function MenuEditorProvider({
  initialMenu,
  initialBaseContentHash,
  children,
}: {
  initialMenu: MenuCatalogFile;
  initialBaseContentHash: string;
  children: ReactNode;
}) {
  const initialSelection = useMemo(() => initialEditorSelection(initialMenu), [initialMenu]);

  const [menu, setMenu] = useState<MenuCatalogFile>(initialMenu);
  const [baselineMenu, setBaselineMenu] = useState<MenuCatalogFile>(initialMenu);
  const [baseContentHash, setBaseContentHash] = useState(initialBaseContentHash);
  const [structureTheme, setStructureTheme] = useState(initialSelection.structureTheme);
  const [editorTab, setEditorTab] = useState<EditorTab>("basic-edit");
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialSelection.categoryId);
  const [selectedItemId, setSelectedItemId] = useState(initialSelection.itemId);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const mainPanelRef = useRef<HTMLElement>(null);

  const isOrganizeMode = editorTab === "organize-edit";
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
  const editedItemCount = useMemo(() => countEditedItems(menu, baselineMenu), [menu, baselineMenu]);
  const themesChanged = useMemo(
    () => !valuesEqual(menu.themes, baselineMenu.themes),
    [menu.themes, baselineMenu.themes],
  );
  const itemCount = menu.categories.reduce((total, category) => total + category.items.length, 0);
  const publishDisabled = busy || (!isOrganizeMode && !selected.item);

  const clearPublishFeedback = useCallback(() => {
    setError(null);
    setConflict(false);
  }, []);

  const updateMenu = useCallback((updater: (current: MenuCatalogFile) => MenuCatalogFile) => {
    setMenu(updater);
    clearPublishFeedback();
  }, [clearPublishFeedback]);

  const fieldChanged = useCallback(
    (path: string, currentValue: unknown): boolean => {
      const baselineValue = path.split(".").reduce<unknown>((value, part) => {
        if (value === null || value === undefined) return undefined;
        if (Array.isArray(value)) return value[Number(part)];
        if (typeof value === "object") return (value as Record<string, unknown>)[part];
        return undefined;
      }, selectedBaseline.item);
      return !valuesEqual(currentValue, baselineValue);
    },
    [selectedBaseline.item],
  );

  const updateThemes = useCallback(
    (updater: (themes: MenuCatalogFile["themes"]) => MenuCatalogFile["themes"]) => {
      updateMenu((current) => ({ ...current, themes: updater(current.themes) }));
    },
    [updateMenu],
  );

  const updateCategoryTitle = useCallback(
    (categoryId: string, language: keyof LocalizedText, value: string) => {
      updateMenu((current) => ({
        ...current,
        categories: current.categories.map((category) =>
          category.id === categoryId
            ? { ...category, title: { ...category.title, [language]: value } }
            : category,
        ),
      }));
    },
    [updateMenu],
  );

  const categoryTitleChanged = useCallback(
    (categoryId: string, language: keyof LocalizedText, value: string): boolean => {
      const baselineCategory = baselineMenu.categories.find((c) => c.id === categoryId);
      return baselineCategory?.title[language] !== value;
    },
    [baselineMenu.categories],
  );

  const updateSelectedItem = useCallback(
    (updater: (item: MenuItem) => MenuItem) => {
      updateMenu((current) => ({
        ...current,
        categories: current.categories.map((category) => {
          if (category.id !== selectedCategoryId) return category;
          return {
            ...category,
            items: category.items.map((item) =>
              item.id === selectedItemId ? updater(item) : item,
            ),
          };
        }),
      }));
    },
    [selectedCategoryId, selectedItemId, updateMenu],
  );

  const updateSelectedItemLocalized = useCallback(
    (field: "name" | "description", language: keyof LocalizedText, value: string) => {
      updateSelectedItem((item) => ({
        ...item,
        [field]: { ...item[field], [language]: value },
      }));
    },
    [updateSelectedItem],
  );

  const updateModifierGroup = useCallback(
    (groupIndex: number, updater: (group: ModifierGroup) => ModifierGroup) => {
      updateSelectedItem((item) => {
        const modifierGroups = item.modifierGroups ?? [];
        return {
          ...item,
          modifierGroups: modifierGroups.map((group, index) =>
            index === groupIndex ? updater(group) : group,
          ),
        };
      });
    },
    [updateSelectedItem],
  );

  const updateModifierOption = useCallback(
    (
      groupIndex: number,
      optionIndex: number,
      updater: (option: ModifierOption) => ModifierOption,
    ) => {
      updateModifierGroup(groupIndex, (group) => ({
        ...group,
        options: group.options.map((option, index) =>
          index === optionIndex ? updater(option) : option,
        ),
      }));
    },
    [updateModifierGroup],
  );

  const chooseCategory = useCallback((category: MenuCategory) => {
    setSelectedCategoryId(category.id);
    setSelectedItemId(category.items[0]?.id ?? "");
  }, []);

  const jumpToIssue = useCallback(
    (issue: ReadinessIssue) => {
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
    },
    [menu.themes],
  );

  const addItem = useCallback(() => {
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
  }, [selectedCategoryId, updateMenu]);

  const addCategoryToTheme = useCallback(
    (themeName: string) => {
      if (!themeName) return;
      let newCategoryId = "";
      updateMenu((current) => {
        const newCategory = makeNewCategory(current.categories);
        newCategoryId = newCategory.id;
        return {
          ...current,
          categories: [...current.categories, newCategory],
          themes: {
            ...current.themes,
            [themeName]: [...(current.themes[themeName] ?? []), newCategory.id],
          },
        };
      });
      if (newCategoryId) {
        setSelectedCategoryId(newCategoryId);
        setSelectedItemId("");
      }
    },
    [updateMenu],
  );

  const canDeleteTheme = useCallback(
    (themeName: string) => canDeleteThemeFromMenu(menu, themeName),
    [menu],
  );

  const addTheme = useCallback(
    (themeName: string): string | null => {
      const key = themeName.trim();
      if (!key) return "Theme name is required.";
      if (menu.themes[key] !== undefined) return "A theme with this name already exists.";
      updateMenu((current) => ({
        ...current,
        themes: { ...current.themes, [key]: [] },
      }));
      setStructureTheme(key);
      return null;
    },
    [menu.themes, updateMenu],
  );

  const removeTheme = useCallback(
    (themeName: string) => {
      if (!canDeleteThemeFromMenu(menu, themeName)) return;
      if (structureTheme === themeName) {
        const remaining = Object.keys(menu.themes).filter((name) => name !== themeName);
        setStructureTheme(remaining[0] ?? "");
      }
      updateMenu((current) => {
        const { [themeName]: _removed, ...restThemes } = current.themes;
        let themeAvailability = current.themeAvailability;
        if (themeAvailability && themeName in themeAvailability) {
          const { [themeName]: _removedAvailability, ...restAvailability } = themeAvailability;
          themeAvailability =
            Object.keys(restAvailability).length > 0 ? restAvailability : undefined;
        }
        return { ...current, themes: restThemes, themeAvailability };
      });
    },
    [menu.themes, structureTheme, updateMenu],
  );

  const canDeleteCategory = useCallback(
    (categoryId: string) => canDeleteCategoryFromMenu(menu, categoryId),
    [menu],
  );

  const deleteCategory = useCallback(
    (categoryId: string) => {
      if (!canDeleteCategoryFromMenu(menu, categoryId)) return;

      if (selectedCategoryId === categoryId) {
        const remaining = menu.categories.filter((c) => c.id !== categoryId);
        const nextCategory = remaining[0];
        setSelectedCategoryId(nextCategory?.id ?? "");
        setSelectedItemId(nextCategory?.items[0]?.id ?? "");
      }

      updateMenu((current) => {
        const categories = current.categories.filter((c) => c.id !== categoryId);
        const themes: MenuCatalogFile["themes"] = {};
        for (const [name, ids] of Object.entries(current.themes)) {
          themes[name] = ids.filter((id) => id !== categoryId);
        }
        return { ...current, categories, themes };
      });
    },
    [menu, selectedCategoryId, updateMenu],
  );

  const removeItem = useCallback(() => {
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
  }, [selectedCategoryId, selectedItemId, updateMenu]);

  const duplicateItem = useCallback(() => {
    const source = selected.item;
    if (!source) return;
    const copy: MenuItem = {
      ...source,
      id: `${slugifyId(source.id, "item")}_copy_${Date.now().toString(36)}`,
      name: {
        en: `${source.name.en} copy`.trim(),
        es: `${source.name.es} copia`.trim(),
      },
      modifierGroups: source.modifierGroups
        ? source.modifierGroups.map((group) => ({
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
  }, [selected.item, selectedCategoryId, updateMenu]);

  const commitAndPublish = useCallback(async () => {
    if (readinessIssues.length > 0) {
      setError(`Fix ${readinessIssues.length} issue(s) before publishing.`);
      setStatus(null);
      jumpToIssue(readinessIssues[0]!);
      return;
    }

    setBusy(true);
    setError(null);
    setConflict(false);
    setStatus("Committing to menu repository...");
    try {
      const outcome = await commitMenuCatalog({ menu, baselineMenu, baseContentHash });
      if (!outcome.ok) {
        setConflict(outcome.conflict);
        setError(outcome.error);
        setStatus(outcome.status);
        return;
      }
      setMenu(outcome.menu);
      setBaselineMenu(outcome.menu);
      setBaseContentHash(outcome.baseContentHash);
      setError(null);
      setStatus(outcome.status);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [baseContentHash, baselineMenu, jumpToIssue, menu, readinessIssues]);

  const value = useMemo<MenuEditorContextValue>(
    () => ({
      theme: EDITOR_THEME,
      menu,
      baselineMenu,
      editorTab,
      setEditorTab,
      isOrganizeMode,
      structureTheme,
      setStructureTheme,
      selectedCategoryId,
      selectedItemId,
      setSelectedItemId,
      selected,
      itemCount,
      editedItemCount,
      themesChanged,
      hasChanges,
      readinessIssues,
      publishDisabled,
      busy,
      status,
      error,
      conflict,
      mainPanelRef,
      fieldChanged,
      chooseCategory,
      jumpToIssue,
      commitAndPublish,
      updateThemes,
      updateCategoryTitle,
      categoryTitleChanged,
      updateSelectedItem,
      updateSelectedItemLocalized,
      updateModifierGroup,
      updateModifierOption,
      addItem,
      addCategoryToTheme,
      addTheme,
      canDeleteCategory,
      canDeleteTheme,
      deleteCategory,
      removeTheme,
      removeItem,
      duplicateItem,
    }),
    [
      addItem,
      addCategoryToTheme,
      addTheme,
      canDeleteCategory,
      canDeleteTheme,
      deleteCategory,
      removeTheme,
      baselineMenu,
      busy,
      commitAndPublish,
      conflict,
      chooseCategory,
      editedItemCount,
      editorTab,
      error,
      fieldChanged,
      duplicateItem,
      hasChanges,
      isOrganizeMode,
      itemCount,
      jumpToIssue,
      menu,
      publishDisabled,
      readinessIssues,
      removeItem,
      selected,
      selectedCategoryId,
      selectedItemId,
      status,
      structureTheme,
      themesChanged,
      updateModifierGroup,
      updateModifierOption,
      updateSelectedItem,
      updateSelectedItemLocalized,
      updateCategoryTitle,
      updateThemes,
    ],
  );

  return <MenuEditorContext.Provider value={value}>{children}</MenuEditorContext.Provider>;
}
