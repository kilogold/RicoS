import { Providers } from "@/components/providers";
import { getLatestMenuRuntime } from "@/lib/commerce/web-api/staff-order-management/lib/menu-runtime";
import { getStoreSession, shoppingEnabled } from "@/lib/commerce/domain/store-hours";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RicoS — Ordena en linea",
  description:
    "Desayuno todo el dia — ordena para recoger con pago seguro por tarjeta.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const menu = await getLatestMenuRuntime();
  const session = getStoreSession(new Date());
  const storeSession = {
    status: session.status,
    shoppingEnabled: shoppingEnabled(session),
    closesAtIso: session.closesAt.toISOString(),
  };
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#07182b]">
        <Providers
          menuCatalog={menu.catalog}
          menuVersion={menu.version}
          storeSession={storeSession}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
