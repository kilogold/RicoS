import menuData from "./menu.json" with { type: "json" };

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
};

export type MenuCategory = {
  id: string;
  title: string;
  notes: string[];
  items: MenuItem[];
};

export type MenuDocument = {
  restaurant: string;
  menuName: string;
  categories: MenuCategory[];
};

export const MENU: MenuDocument = menuData as MenuDocument;

const itemIndex = new Map<string, MenuItem>();

for (const cat of MENU.categories) {
  for (const item of cat.items) {
    itemIndex.set(item.id, item);
  }
}

export function getItemById(id: string): MenuItem | undefined {
  return itemIndex.get(id);
}

export function listAllItems(): MenuItem[] {
  return [...itemIndex.values()];
}
