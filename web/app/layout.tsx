import { Providers } from "@/components/providers";
import { getStoreSession, shoppingEnabled } from "@/lib/commerce/domain/store-hours";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { LANGUAGE_COOKIE, parseLanguage } from "@/lib/language";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RicoS",
  description:
    "Bienvenidos a RicoS. Conócenos y ordena en línea.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const language = parseLanguage(cookieStore.get(LANGUAGE_COOKIE)?.value);
  const session = getStoreSession(new Date());
  const storeSession = {
    status: session.status,
    shoppingEnabled: shoppingEnabled(session),
    closesAtIso: session.closesAt.toISOString(),
  };
  return (
    <html
      lang={language}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased${theme === "dark" ? " dark" : ""}`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers
          storeSession={storeSession}
          theme={theme}
          initialLanguage={language}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
