"use client";

import { AnnouncementProvider } from "@/lib/announcement-context";
import type { AnnouncementConfig } from "@/lib/announcement-config";
import { useCart } from "@/lib/cart-context";
import { MenuRuntimeProvider } from "@/lib/menu-runtime-context";
import type { MenuDocument } from "@ricos/shared";
import { useEffect, type ReactNode } from "react";

export function CommerceProviders({ children, catalog, menuVersion, announcement }: {
  children: ReactNode;
  catalog: MenuDocument;
  menuVersion: number;
  announcement: AnnouncementConfig | null;
}) {
  const { menuVersion: cartMenuVersion, synchronizeMenuVersion } = useCart();
  useEffect(() => {
    synchronizeMenuVersion(menuVersion);
  }, [menuVersion, synchronizeMenuVersion]);

  // Do not mount checkout with a surviving cart from a different catalog.
  if (cartMenuVersion !== null && cartMenuVersion !== menuVersion) return null;

  return (
    <MenuRuntimeProvider catalog={catalog} menuVersion={menuVersion}>
      <AnnouncementProvider value={announcement}>{children}</AnnouncementProvider>
    </MenuRuntimeProvider>
  );
}
