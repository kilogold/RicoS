"use client";

import type { StoreSessionStatus } from "@/lib/commerce/domain/store-hours";
import { useCart } from "@/lib/cart-context";
import { createContext, useContext, useEffect, type ReactNode } from "react";

export type StoreSessionClient = {
  status: StoreSessionStatus;
  shoppingEnabled: boolean;
  closesAtIso: string;
};

const StoreSessionContext = createContext<StoreSessionClient | null>(null);

export function StoreSessionProvider({
  value,
  children,
}: {
  value: StoreSessionClient;
  children: ReactNode;
}) {
  return (
    <StoreSessionContext.Provider value={value}>{children}</StoreSessionContext.Provider>
  );
}

export function useStoreSession(): StoreSessionClient {
  const ctx = useContext(StoreSessionContext);
  if (!ctx) throw new Error("useStoreSession must be used within StoreSessionProvider");
  return ctx;
}

/** Clears cart when the store is closed (browse-only). */
export function StoreSessionCartSync() {
  const { status } = useStoreSession();
  const { lines, clear } = useCart();
  useEffect(() => {
    if (status === "closed" && lines.length > 0) clear();
  }, [status, lines.length, clear]);
  return null;
}
