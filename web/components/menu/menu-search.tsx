"use client";

/**
 * Sticky search field for the storefront menu.
 *
 * Controlled by the parent: `value` is the current query, `onChange` updates it.
 * Typing here does not fetch anything — the parent re-derives which menu sections
 * to show (full menu when empty, pruned matches when non-empty).
 *
 * Sits just under SiteHeader (header is sticky top-0 / h-16), so `top-16`
 * keeps this bar pinned below the header while the user scrolls the grid.
 */

import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";

type MenuSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export function MenuSearch({ value, onChange }: MenuSearchProps) {
  const { language } = useLanguage();
  const copy = getAppStrings(language);

  return (
    <div className="sticky top-16 z-30 border-b border-foreground/10 bg-background/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
        {/*
          form + preventDefault: Enter must not reload the page.
          role="search" marks this region for assistive tech.
        */}
        <form
          role="search"
          className="relative"
          onSubmit={(event) => event.preventDefault()}
        >
          <label htmlFor="menu-search-input" className="sr-only">
            {copy.menuSearchLabel}
          </label>
          {/*
            Hide WebKit/Edge native clear icons — type="search" adds its own ✕
            on many browsers, which duplicates the button below.
          */}
          <input
            id="menu-search-input"
            type="search"
            autoComplete="off"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={copy.menuSearchPlaceholder}
            className="w-full rounded-lg border border-foreground/15 bg-surface py-2.5 pl-4 pr-12 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/40 [&::-ms-clear]:hidden [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
          />
          {/* Clear only when there is something to clear — resets parent to full menu. */}
          {value.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label={copy.menuSearchClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-sm text-muted hover:bg-foreground/5 hover:text-foreground"
            >
              ✕
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
