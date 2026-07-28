"use client";

import type { AnnouncementConfig } from "@/lib/announcement-config";
import { AnnouncementProvider } from "@/lib/announcement-context";
import { CartProvider } from "@/lib/cart-context";
import { LanguageProvider } from "@/lib/language-context";
import { MenuRuntimeProvider } from "@/lib/menu-runtime-context";
import { ThemeProvider } from "@/lib/theme-context";
import type { Theme } from "@/lib/theme";
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
  announcement,
  theme,
}: {
  children: ReactNode;
  menuCatalog: MenuDocument;
  menuVersion: number;
  storeSession: StoreSessionClient;
  announcement: AnnouncementConfig | null;
  theme: Theme;
}) {
  return (
    <ThemeProvider initialTheme={theme}>
      <LanguageProvider>
        <MenuRuntimeProvider catalog={menuCatalog} menuVersion={menuVersion}>
          <StoreSessionProvider value={storeSession}>
            <AnnouncementProvider value={announcement}>
              <CartProvider>
                <StoreSessionCartSync />
                {children}
              </CartProvider>
            </AnnouncementProvider>
          </StoreSessionProvider>
        </MenuRuntimeProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
