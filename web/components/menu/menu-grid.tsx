"use client";

import { useCart } from "@/lib/cart-context";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { useMenuRuntime } from "@/lib/menu-runtime-context";
import { useStoreSession } from "@/app/_client/store-session-context";
import {
  formatThemeAvailabilityLabel,
  type MenuDocument,
  type MenuItem,
  type ThemedMenuSection,
} from "@ricos/shared";
import { useState } from "react";
import { ItemCard } from "./item-card";
import { ItemModal } from "./item-modal";

type MenuGridProps = {
  catalog: MenuDocument;
  sections: ThemedMenuSection[];
};

export function MenuGrid({ catalog, sections }: MenuGridProps) {
  const { addItem } = useCart();
  const { language } = useLanguage();
  const { surface } = useMenuRuntime();
  const { shoppingEnabled } = useStoreSession();
  const browseOnly = !shoppingEnabled;
  const copy = getAppStrings(language);
  const [modalState, setModalState] = useState<{
    item: MenuItem;
    browseOnly: boolean;
  } | null>(null);

  return (
    <>
      <div className="space-y-16">
        {sections.map(({ theme, categories, scheduleActive }) => {
          const themeBrowseOnly = browseOnly || !scheduleActive;
          const availability = catalog.themeAvailability?.[theme];
          const scheduleLabel =
            availability !== undefined
              ? formatThemeAvailabilityLabel(availability, language)
              : null;

          return (
            <section key={theme} aria-labelledby={`theme-${theme}`} className="space-y-2">
              <h2
                id={`theme-${theme}`}
                className="text-2xl font-extrabold uppercase tracking-[0.2em] text-accent md:text-3xl"
              >
                {theme}
              </h2>
              {!scheduleActive && scheduleLabel ? (
                <p
                  className="rounded-lg border border-amber-400/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100"
                  role="status"
                >
                  {copy.themeScheduleUnavailable}{" "}
                  <span className="font-medium text-amber-50">
                    {copy.themeScheduleAvailableWhen} {scheduleLabel}
                  </span>
                </p>
              ) : null}
              {categories.map((cat) => (
                <section
                  key={cat.id}
                  aria-labelledby={`cat-${cat.id}`}
                  className="mt-10 first:mt-0"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <h3
                      id={`cat-${cat.id}`}
                      className="inline-block rounded-md bg-category px-4 py-1.5 text-lg font-bold uppercase tracking-wide text-white shadow-md"
                    >
                      {surface.resolveLocalizedText(cat.title, language)}
                    </h3>
                  </div>
                  {cat.notes.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-sm text-muted">
                      {cat.notes.map((note) => (
                        <li key={surface.resolveLocalizedText(note, "en")}>
                          {surface.resolveLocalizedText(note, language)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {cat.items.map((item) => {
                      const modifierGroups = surface.getModifierGroupsForItem(item.id);
                      const hasModifiers = modifierGroups.length > 0;

                      return (
                        <li key={item.id}>
                          <ItemCard
                            item={item}
                            surface={surface}
                            language={language}
                            browseOnly={themeBrowseOnly}
                            hasModifiers={hasModifiers}
                            onQuickAdd={() => addItem(item.id, {})}
                            onOpenModal={() =>
                              setModalState({ item, browseOnly: themeBrowseOnly })
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </section>
          );
        })}
      </div>

      {modalState ? (
        <ItemModal
          item={modalState.item}
          browseOnly={modalState.browseOnly}
          onClose={() => setModalState(null)}
        />
      ) : null}
    </>
  );
}
