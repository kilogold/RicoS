"use client";

import { CartProvider } from "@/lib/cart-context";
import { LanguageProvider } from "@/lib/language-context";
import { MenuRuntimeProvider } from "@/lib/menu-runtime-context";
import type { MenuDocument } from "@ricos/shared";
import type { ReactNode } from "react";

export function Providers({
  children,
  menuCatalog,
  menuVersion,
}: {
  children: ReactNode;
  menuCatalog: MenuDocument;
  menuVersion: number;
}) {
  return (
    <LanguageProvider>
      <MenuRuntimeProvider catalog={menuCatalog} menuVersion={menuVersion}>
        <CartProvider>{children}</CartProvider>
      </MenuRuntimeProvider>
    </LanguageProvider>
  );
}
