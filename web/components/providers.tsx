"use client";

import { CartProvider } from "@/lib/cart-context";
import { LanguageProvider } from "@/lib/language-context";
import { ThemeProvider } from "@/lib/theme-context";
import type { Theme } from "@/lib/theme";
import {
  StoreSessionCartSync,
  StoreSessionProvider,
  type StoreSessionClient,
} from "@/app/_client/store-session-context";
import type { Language } from "@ricos/shared";
import type { ReactNode } from "react";

export function Providers({ children, storeSession, theme, initialLanguage }: {
  children: ReactNode;
  storeSession: StoreSessionClient;
  theme: Theme;
  initialLanguage: Language;
}) {
  return (
    <ThemeProvider initialTheme={theme}>
      <LanguageProvider initialLanguage={initialLanguage}>
        <StoreSessionProvider value={storeSession}>
          <CartProvider>
            <StoreSessionCartSync />
            {children}
          </CartProvider>
        </StoreSessionProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
