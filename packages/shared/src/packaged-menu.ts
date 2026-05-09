import { parseMenuCatalogFile, type ParsedMenuCatalogFile } from "./menu-catalog-file";
import menuRaw from "./menu.json" with { type: "json" };

/** Repo-shipped default catalog (for bootstrap / staff publish input). */
export function getPackagedMenuCatalogParsed(): ParsedMenuCatalogFile {
  return parseMenuCatalogFile(menuRaw);
}
