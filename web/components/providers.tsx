"use client";

import { CartProvider } from "@/lib/commerce/web-client/cart";
import { LanguageProvider } from "@/lib/shared/i18n";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <CartProvider>{children}</CartProvider>
    </LanguageProvider>
  );
}
