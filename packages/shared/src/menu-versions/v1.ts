import menuData from "../menu.json" with { type: "json" };
import type { MenuDocument } from "../menu-types.js";
import type { MenuVersion } from "./index.js";

/**
 * First published menu snapshot.
 *
 * The catalog is loaded from the canonical `menu.json` at build time. Once
 * published (this module imported by any running process), this object is
 * treated as immutable. To change prices or structure, create `v2.ts` and
 * register it in `menu-versions/index.ts`.
 */
export const menuVersion1: MenuVersion = {
  version: 1,
  publishedAt: "2026-04-22T00:00:00.000Z",
  catalog: menuData as MenuDocument,
};
