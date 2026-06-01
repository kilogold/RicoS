import type { MenuCatalogFile } from "@ricos/shared";

export function menuCatalogBody(
  menu: MenuCatalogFile,
): Omit<MenuCatalogFile, "catalogVersion" | "publishedAt"> {
  const { catalogVersion: _, publishedAt: __, ...body } = menu;
  return body;
}

export function hasMenuCatalogChanges(a: MenuCatalogFile, b: MenuCatalogFile): boolean {
  return JSON.stringify(menuCatalogBody(a)) !== JSON.stringify(menuCatalogBody(b));
}
