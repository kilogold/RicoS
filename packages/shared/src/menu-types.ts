/**
 * Type definitions for the menu document shape.
 *
 * Separated from the top-level index module so menu-version entries can
 * depend on these types without creating a circular import.
 */

export type SelectionType = "single" | "multiple";

export type Language = "en" | "es";

export type LocalizedText = {
  en: string;
  es: string;
};

export type ModifierOption = {
  id: string;
  label: LocalizedText;
  priceDeltaCents?: number;
};

export type ModifierGroup = {
  id: string;
  title: LocalizedText;
  selectionType: SelectionType;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
};

export type MenuItem = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  priceCents: number;
  modifierGroups?: ModifierGroup[];
};

export type MenuCategory = {
  id: string;
  title: LocalizedText;
  notes: LocalizedText[];
  items: MenuItem[];
};

export type MenuDocument = {
  restaurant: LocalizedText;
  menuName: LocalizedText;
  categories: MenuCategory[];
};
