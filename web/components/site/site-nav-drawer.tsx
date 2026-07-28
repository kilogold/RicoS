"use client";

import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { HiMoon, HiSun } from "react-icons/hi2";

type SiteNavDrawerProps = {
  open: boolean;
  onClose: () => void;
};

const NAV_LINKS = [
  { href: "/", key: "navOrderOnline" as const },
  { href: "/find-us", key: "navFindUs" as const },
  { href: "/employment", key: "navEmployment" as const },
];

export function SiteNavDrawer({ open, onClose }: SiteNavDrawerProps) {
  const pathname = usePathname();
  const { language } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const copy = getAppStrings(language);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label={copy.closeModal}
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={copy.siteMenuLabel}
        className="relative flex h-full w-full max-w-xs flex-col border-r border-foreground/10 bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-end border-b border-foreground/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.closeModal}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 text-foreground/70 hover:bg-foreground/5"
          >
            ×
          </button>
        </div>
        <nav className="relative flex flex-1 flex-col gap-2 p-4">
          {NAV_LINKS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-accent text-white"
                    : "text-foreground/85 hover:bg-foreground/5"
                }`}
              >
                {copy[item.key]}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? copy.themeToggleToLight : copy.themeToggleToDark}
            className="absolute bottom-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-foreground/15 text-foreground/80 transition hover:bg-foreground/5 hover:text-foreground"
          >
            {theme === "dark" ? (
              <HiSun className="h-5 w-5" aria-hidden="true" />
            ) : (
              <HiMoon className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </nav>
      </aside>
    </div>
  );
}
