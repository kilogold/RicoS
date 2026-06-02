import type { LineSelections, ModifierGroup, ModifierVisibilityRule } from "./menu-types";

export type { ModifierVisibilityRule };

export type ModifierGroupWithVisibility = Pick<ModifierGroup, "id" | "visibleWhen">;

/** True when the group should be shown, validated, and priced. */
export function isModifierGroupActive(
  group: ModifierGroupWithVisibility,
  selections: LineSelections,
): boolean {
  if (!group.visibleWhen) {
    return true;
  }
  const picked = selections[group.visibleWhen.groupId] ?? [];
  return group.visibleWhen.optionIds.some((optionId) => picked.includes(optionId));
}

/** Drops selection keys for inactive modifier groups. */
export function pruneInactiveSelections(
  groups: ModifierGroupWithVisibility[],
  selections: LineSelections,
): LineSelections {
  const pruned: LineSelections = {};
  for (const group of groups) {
    const values = selections[group.id];
    if (!values?.length) continue;
    if (!isModifierGroupActive(group, selections)) continue;
    pruned[group.id] = [...values];
  }
  return pruned;
}

/** True when any inactive group still has selections (stale cart). */
export function hasStaleInactiveSelections(
  groups: ModifierGroupWithVisibility[],
  selections: LineSelections,
): boolean {
  for (const group of groups) {
    if (!group.visibleWhen) continue;
    const values = selections[group.id];
    if (!values?.length) continue;
    if (!isModifierGroupActive(group, selections)) {
      return true;
    }
  }
  return false;
}
