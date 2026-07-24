"use client";

import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { useCallback, useEffect, useRef, useState } from "react";

export type CategoryNavItem = {
  id: string;
  label: string;
  themeActive: boolean;
};

type CategoryNavProps = {
  categories: CategoryNavItem[];
};

const STICKY_OFFSET_PX = 120;

export function CategoryNav({ categories }: CategoryNavProps) {
  const { language } = useLanguage();
  const copy = getAppStrings(language);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(categories[0]?.id ?? null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollButtons();
    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    const observer = new ResizeObserver(updateScrollButtons);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollButtons);
      observer.disconnect();
    };
  }, [categories, updateScrollButtons]);

  useEffect(() => {
    const elements = categories
      .map((cat) => document.getElementById(cat.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: `-${STICKY_OFFSET_PX}px 0px -60% 0px`,
        threshold: 0,
      },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [categories]);

  const scrollToCategory = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - STICKY_OFFSET_PX;
    window.scrollTo({ top, behavior: "smooth" });
    setActiveId(id);
  };

  const scrollByAmount = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === "left" ? -200 : 200, behavior: "smooth" });
  };

  if (categories.length === 0) return null;

  return (
    <nav
      aria-label={copy.allCategories}
      className="sticky top-0 z-40 border-b border-white/10 bg-background/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2 md:px-6">
        {canScrollLeft ? (
          <button
            type="button"
            onClick={() => scrollByAmount("left")}
            aria-label={copy.scrollCategoriesLeft}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10 sm:flex"
          >
            ‹
          </button>
        ) : null}

        <div
          ref={scrollRef}
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {categories.map((cat) => {
            const isActive = activeId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToCategory(cat.id)}
                className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                  isActive
                    ? "border-accent text-accent"
                    : "border-transparent text-white/70 hover:text-white"
                } ${!cat.themeActive ? "opacity-50" : ""}`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {canScrollRight ? (
          <button
            type="button"
            onClick={() => scrollByAmount("right")}
            aria-label={copy.scrollCategoriesRight}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10 sm:flex"
          >
            ›
          </button>
        ) : null}
      </div>
    </nav>
  );
}
