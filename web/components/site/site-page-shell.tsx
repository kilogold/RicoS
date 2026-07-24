"use client";

import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import Link from "next/link";
import type { ReactNode } from "react";

type SitePageShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function SitePageShell({ title, description, children }: SitePageShellProps) {
  const { language } = useLanguage();
  const copy = getAppStrings(language);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <Link href="/" className="text-sm text-accent hover:underline">
        ← {copy.backToMenu}
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">{title}</h1>
      {description ? <p className="mt-3 max-w-3xl text-muted">{description}</p> : null}
      <div className="mt-6 space-y-6">{children}</div>
    </main>
  );
}
