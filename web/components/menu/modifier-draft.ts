import {
  normalizeSelections,
  pruneInactiveSelections,
  type LineSelections,
  type MenuCatalogSurface,
} from "@ricos/shared";

/**
 * Build the initial in-modal draft for an item.
 *
 * Starts from any existing/partial picks, then auto-selects options in required
 * groups until each group's `minSelections` is satisfied (first eligible option
 * in catalog order). Only groups that are currently visible for the draft are
 * considered — conditional groups hidden by earlier picks are skipped.
 *
 * Used when opening the item modal so required modifiers are pre-filled and
 * validation can pass without the user touching every group first.
 */
export function mergeRequiredSelectionDefaults(
  surface: MenuCatalogSurface,
  itemId: string,
  raw: LineSelections | undefined,
): LineSelections {
  const base = normalizeSelections(raw ?? {});
  const groups = surface.getActiveModifierGroupsForItem(itemId, base);
  const next: LineSelections = { ...base };
  for (const group of groups) {
    if (!group.required || group.options.length === 0) continue;
    const picked = [...(next[group.id] ?? [])];
    if (picked.length >= group.minSelections) continue;
    const pickedSet = new Set(picked);
    for (const opt of group.options) {
      if (picked.length >= group.minSelections) break;
      if (picked.length >= group.maxSelections) break;
      if (pickedSet.has(opt.id)) continue;
      picked.push(opt.id);
      pickedSet.add(opt.id);
    }
    next[group.id] = picked;
  }
  const allGroups = surface.getModifierGroupsForItem(itemId);
  return pruneInactiveSelections(allGroups, normalizeSelections(next));
}

/**
 * Normalize draft picks after the user toggles an option.
 *
 * Drops selections for modifier groups that are no longer active (e.g. a side
 * group that only appears after choosing a specific entree). Without this,
 * stale picks from hidden groups would linger in state and fail validation.
 */
export function pruneDraftSelections(
  surface: MenuCatalogSurface,
  itemId: string,
  next: LineSelections,
): LineSelections {
  const groups = surface.getModifierGroupsForItem(itemId);
  return pruneInactiveSelections(groups, normalizeSelections(next));
}
