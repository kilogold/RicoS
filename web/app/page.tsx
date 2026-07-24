"use client";

import { CategoryNav, type CategoryNavItem } from "@/components/menu/category-nav";
import { CartDrawer, FloatingCartButton } from "@/components/menu/cart-drawer";
import { MenuGrid } from "@/components/menu/menu-grid";
import { MenuSearch } from "@/components/menu/menu-search";
import { AnnouncementCard } from "@/components/site/announcement-card";
import { SiteHeader } from "@/components/site/site-header";
import { StoreHoursBanners } from "@/app/_client/store-hours-banners";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import {
  countItemsInThemedSections,
  filterThemedMenuSections,
} from "@/lib/menu-search";
import { useMenuRuntime } from "@/lib/menu-runtime-context";
import { useStoreLocalNow } from "@/lib/use-store-local-now";
import { buildThemedMenuSections } from "@ricos/shared";
import { useMemo, useState } from "react";

export default function Home() {
  const { language } = useLanguage();
  const { catalog, surface } = useMenuRuntime();
  const copy = getAppStrings(language);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const now = useStoreLocalNow();
  const isSearching = searchQuery.trim().length > 0;

  const themedSections = useMemo(
    () => buildThemedMenuSections(catalog, { now }),
    [catalog, now],
  );

  const visibleSections = useMemo(
    () => filterThemedMenuSections(themedSections, searchQuery, language),
    [themedSections, searchQuery, language],
  );

  const navCategories = useMemo<CategoryNavItem[]>(
    () =>
      themedSections.flatMap(({ categories, scheduleActive }) =>
        categories.map((cat) => ({
          id: `cat-${cat.id}`,
          label: surface.resolveLocalizedText(cat.title, language),
          themeActive: scheduleActive,
        })),
      ),
    [themedSections, surface, language],
  );

  const resultCount = useMemo(
    () => countItemsInThemedSections(visibleSections),
    [visibleSections],
  );

  const resultStatus = isSearching
    ? resultCount === 0
      ? copy.menuSearchNoResults.replace("{query}", searchQuery.trim())
      : copy.menuSearchShowingResults
          .replace("{count}", String(resultCount))
          .replace("{query}", searchQuery.trim())
    : null;

  return (
    <main className="relative">
      <SiteHeader />
      <StoreHoursBanners />
      <div className="border-b border-white/10 bg-linear-to-br from-surface via-[#0a1f38] to-background px-4 py-12 md:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">
            {copy.homeTagline}
          </p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            {surface.resolveLocalizedText(catalog.menuName, language)}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/75">{copy.homeSubtitle}</p>
        </div>
      </div>

      <AnnouncementCard />

      <MenuSearch value={searchQuery} onChange={setSearchQuery} />

      {resultStatus ? (
        <div className="mx-auto max-w-6xl px-4 pt-4 md:px-6">
          <p className="text-sm text-white/70" role="status">
            {resultStatus}
          </p>
        </div>
      ) : null}

      {!isSearching ? <CategoryNav categories={navCategories} /> : null}

      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
        <MenuGrid catalog={catalog} sections={visibleSections} />
      </div>

      <FloatingCartButton onOpen={() => setCartOpen(true)} hidden={cartOpen} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </main>
  );
}
