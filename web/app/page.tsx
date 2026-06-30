"use client";

import { CategoryNav, type CategoryNavItem } from "@/components/menu/category-nav";
import { CartDrawer, FloatingCartButton } from "@/components/menu/cart-drawer";
import { MenuGrid } from "@/components/menu/menu-grid";
import { SiteHeader } from "@/components/site/site-header";
import { StoreHoursBanners } from "@/app/_client/store-hours-banners";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { useMenuRuntime } from "@/lib/menu-runtime-context";
import { useStoreLocalNow } from "@/lib/use-store-local-now";
import { buildThemedMenuSections } from "@ricos/shared";
import { useMemo, useState } from "react";

export default function Home() {
  const { language } = useLanguage();
  const { catalog, surface } = useMenuRuntime();
  const copy = getAppStrings(language);
  const [cartOpen, setCartOpen] = useState(false);
  const now = useStoreLocalNow();

  const themedSections = useMemo(
    () => buildThemedMenuSections(catalog, { now }),
    [catalog, now],
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

      <CategoryNav categories={navCategories} />

      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
        <MenuGrid catalog={catalog} />
      </div>

      <FloatingCartButton onOpen={() => setCartOpen(true)} hidden={cartOpen} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </main>
  );
}
