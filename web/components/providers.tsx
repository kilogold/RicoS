"use client";

import { CartProvider } from "@/lib/cart-context";
import { LanguageProvider } from "@/lib/language-context";
import { MenuRuntimeProvider } from "@/lib/menu-runtime-context";
import {
  StoreSessionCartSync,
  StoreSessionProvider,
  type StoreSessionClient,
} from "@/app/_client/store-session-context";
import type { MenuDocument } from "@ricos/shared";
import type { ReactNode } from "react";

export function Providers({
  children,
  menuCatalog,
  menuVersion,
  storeSession,
}: {
  children: ReactNode;
  menuCatalog: MenuDocument;
  menuVersion: number;
  storeSession: StoreSessionClient;
}) {
  return (
    <LanguageProvider>
      <MenuRuntimeProvider catalog={menuCatalog} menuVersion={menuVersion}>
        <StoreSessionProvider value={storeSession}>
          <CartProvider>
            <StoreSessionCartSync />
            {children}
          </CartProvider>
        </StoreSessionProvider>
      </MenuRuntimeProvider>
    </LanguageProvider>
  );
}
