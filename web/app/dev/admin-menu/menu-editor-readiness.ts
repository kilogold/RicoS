import type { MenuCatalogFile, MenuItem, ModifierGroup } from "@ricos/shared";

export type EditorTab = "basic-edit" | "organize-edit" | "advanced-setup";

export type ReadinessIssue = {
  id: string;
  message: string;
  tab: EditorTab;
  categoryId?: string;
  itemId?: string;
  groupIndex?: number;
};

function itemLabel(item: MenuItem): string {
  return item.name.en.trim() || item.name.es.trim() || item.id;
}

function checkVisibleWhen(
  menu: MenuCatalogFile,
  categoryId: string,
  item: MenuItem,
  group: ModifierGroup,
  groupIndex: number,
  issues: ReadinessIssue[],
): void {
  if (!group.visibleWhen) return;
  const { groupId, optionIds } = group.visibleWhen;
  const label = itemLabel(item);
  const push = (message: string) => {
    issues.push({
      id: `${categoryId}:${item.id}:group:${groupIndex}:${issues.length}`,
      message,
      tab: "advanced-setup",
      categoryId,
      itemId: item.id,
      groupIndex,
    });
  };

  if (!groupId.trim()) {
    push(`"${label}": choice group "${group.title.en || group.id}" needs a trigger group.`);
    return;
  }
  if (optionIds.length === 0) {
    push(`"${label}": choice group "${group.title.en || group.id}" needs at least one trigger option.`);
    return;
  }

  const driver = (item.modifierGroups ?? []).find((g) => g.id === groupId);
  if (!driver) {
    push(
      `"${label}": choice group "${group.title.en || group.id}" references missing group "${groupId}".`,
    );
    return;
  }
  for (const optionId of optionIds) {
    if (!driver.options.some((opt) => opt.id === optionId)) {
      push(
        `"${label}": choice group "${group.title.en || group.id}" references missing option "${optionId}".`,
      );
    }
  }
}

export function collectMenuReadinessIssues(menu: MenuCatalogFile): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const assigned = new Set<string>();

  for (const [themeName, categoryIds] of Object.entries(menu.themes)) {
    for (const categoryId of categoryIds) {
      if (assigned.has(categoryId)) {
        issues.push({
          id: `theme-dup:${categoryId}`,
          message: `Category "${categoryId}" appears in more than one theme (${themeName}).`,
          tab: "organize-edit",
        });
      }
      assigned.add(categoryId);
    }
  }

  for (const category of menu.categories) {
    if (!assigned.has(category.id)) {
      const title = category.title.en || category.id;
      issues.push({
        id: `unassigned:${category.id}`,
        message: `"${title}" is not assigned to any theme.`,
        tab: "organize-edit",
        categoryId: category.id,
      });
    }

    for (const item of category.items) {
      const label = itemLabel(item);
      if (!item.name.en.trim() && !item.name.es.trim()) {
        issues.push({
          id: `name:${category.id}:${item.id}`,
          message: `Item in "${category.title.en || category.id}" needs a name.`,
          tab: "basic-edit",
          categoryId: category.id,
          itemId: item.id,
        });
      }
      if (item.priceCents <= 0) {
        issues.push({
          id: `price:${category.id}:${item.id}`,
          message: `"${label}" needs a price greater than $0.00.`,
          tab: "basic-edit",
          categoryId: category.id,
          itemId: item.id,
        });
      }
      (item.modifierGroups ?? []).forEach((group, groupIndex) => {
        checkVisibleWhen(menu, category.id, item, group, groupIndex, issues);
      });
    }
  }

  return issues;
}

export function getAssignedCategoryIds(menu: MenuCatalogFile): Set<string> {
  const assigned = new Set<string>();
  for (const categoryIds of Object.values(menu.themes)) {
    for (const id of categoryIds) assigned.add(id);
  }
  return assigned;
}

export function getUnassignedCategories(menu: MenuCatalogFile) {
  const assigned = getAssignedCategoryIds(menu);
  return menu.categories.filter((c) => !assigned.has(c.id));
}

export function findThemeForCategory(menu: MenuCatalogFile, categoryId: string): string | null {
  for (const [theme, ids] of Object.entries(menu.themes)) {
    if (ids.includes(categoryId)) return theme;
  }
  return null;
}
