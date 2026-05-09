"use client";

import { createMenuCatalogSurface, type MenuDocument, type MenuCatalogSurface } from "@ricos/shared";
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

export type MenuRuntimeClientValue = {
  /** Menu version the user last loaded from the server (send as `menuVersionSeen` at checkout). */
  menuVersionSeen: number;
  catalog: MenuDocument;
  surface: MenuCatalogSurface;
};

const MenuRuntimeContext = createContext<MenuRuntimeClientValue | null>(null);

export function MenuRuntimeProvider({
  children,
  catalog,
  menuVersion,
}: {
  children: ReactNode;
  catalog: MenuDocument;
  menuVersion: number;
}) {
  const surface = useMemo(() => createMenuCatalogSurface(catalog), [catalog]);
  const value = useMemo(
    (): MenuRuntimeClientValue => ({
      menuVersionSeen: menuVersion,
      catalog,
      surface,
    }),
    [catalog, menuVersion, surface],
  );
  return (
    <MenuRuntimeContext.Provider value={value}>{children}</MenuRuntimeContext.Provider>
  );
}

export function useMenuRuntime(): MenuRuntimeClientValue {
  const ctx = useContext(MenuRuntimeContext);
  if (!ctx) {
    throw new Error("useMenuRuntime must be used within MenuRuntimeProvider");
  }
  return ctx;
}
