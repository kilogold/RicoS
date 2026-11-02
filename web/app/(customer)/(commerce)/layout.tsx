import { CommerceProviders } from "@/components/commerce-providers";
import { parseAnnouncementConfig } from "@/lib/announcement-config";
import { getLatestMenuRuntime } from "@/lib/commerce/web-api/staff-order-management/lib/menu-runtime";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "RicoS — Ordena en linea",
  description: "Desayuno todo el dia — ordena para recoger con pago seguro por tarjeta.",
};

export default async function CommerceLayout({ children }: { children: ReactNode }) {
  const menu = await getLatestMenuRuntime();
  return (
    <CommerceProviders catalog={menu.catalog} menuVersion={menu.version} announcement={parseAnnouncementConfig()}>
      {children}
    </CommerceProviders>
  );
}
