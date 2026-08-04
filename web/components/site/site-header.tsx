"use client";

import { RicoSLogo } from "@/components/site/ricos-logo";
import { SiteNavDrawer } from "@/components/site/site-nav-drawer";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import Link from "next/link";
import { useState } from "react";

export function SiteHeader() {
  const { language, setLanguage } = useLanguage();
  const copy = getAppStrings(language);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="top-0 z-40 border-b border-foreground/10 bg-surface/95 backdrop-blur">
        <div className="site-container grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center justify-self-start text-foreground transition hover:opacity-70"
            aria-label={copy.siteMenuLabel}
          >
            <span className="flex w-5 flex-col gap-1.5" aria-hidden="true">
              <span className="block h-0.5 w-full rounded-full bg-current" />
              <span className="block h-0.5 w-full rounded-full bg-current" />
              <span className="block h-0.5 w-full rounded-full bg-current" />
            </span>
          </button>
          <Link href="/" aria-label="RicoS" className="text-foreground">
            <RicoSLogo height={60} />
          </Link>
          <div className="inline-flex items-center justify-self-end gap-1 rounded-lg border border-foreground/15 bg-background p-1">
            <button
              type="button"
              onClick={() => setLanguage("es")}
              aria-label={copy.spanishLabel}
              className={`rounded px-2 py-1 text-xs ${
                language === "es" ? "bg-accent text-white" : "text-foreground/75 hover:bg-foreground/5"
              }`}
            >
              ES
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              aria-label={copy.englishLabel}
              className={`rounded px-2 py-1 text-xs ${
                language === "en" ? "bg-accent text-white" : "text-foreground/75 hover:bg-foreground/5"
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </header>
      <SiteNavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
