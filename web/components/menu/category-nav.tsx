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
const SCROLL_IDLE_MS = 150;
const SCROLL_INTERRUPT_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

export function CategoryNav({ categories }: CategoryNavProps) {
  const { language } = useLanguage();
  const copy = getAppStrings(language);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollLockedRef = useRef(false);
  const scrollLockCleanupRef = useRef<(() => void) | null>(null);
  const [activeId, setActiveId] = useState<string | null>(categories[0]?.id ?? null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const syncHorizontalOverflowArrows = useCallback(() => {
    const pillStrip = scrollRef.current;
    if (!pillStrip) return;

    const scrollEdgeTolerancePx = 4;
    const hasHiddenPillsOnLeft = pillStrip.scrollLeft > scrollEdgeTolerancePx;
    const hasHiddenPillsOnRight =
      pillStrip.scrollLeft + pillStrip.clientWidth <
      pillStrip.scrollWidth - scrollEdgeTolerancePx;

    setCanScrollLeft(hasHiddenPillsOnLeft);
    setCanScrollRight(hasHiddenPillsOnRight);
  }, []);

  // Show left/right arrows only when the pill strip overflows horizontally.
  useEffect(() => {
    const pillStrip = scrollRef.current;
    if (!pillStrip) return;

    syncHorizontalOverflowArrows();

    pillStrip.addEventListener("scroll", syncHorizontalOverflowArrows, { passive: true });

    const resizeObserver = new ResizeObserver(syncHorizontalOverflowArrows);
    resizeObserver.observe(pillStrip);

    return () => {
      pillStrip.removeEventListener("scroll", syncHorizontalOverflowArrows);
      resizeObserver.disconnect();
    };
  }, [syncHorizontalOverflowArrows]);

  // Keep the active pill visible as vertical scroll changes the selection.
  useEffect(() => {
    if (!activeId) return;

    const pillStrip = scrollRef.current;
    if (!pillStrip) return;

    const activePill = pillStrip.querySelector<HTMLButtonElement>(
      `[data-category-id="${CSS.escape(activeId)}"]`,
    );
    if (!activePill) return;

    activePill.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeId]);

  const releaseScrollLock = () => {
    scrollLockedRef.current = false;
    scrollLockCleanupRef.current?.();
    scrollLockCleanupRef.current = null;
  };

  const acquireScrollLock = () => {
    // Restart lock lifecycle when the user clicks another category mid-scroll.
    scrollLockCleanupRef.current?.();
    scrollLockedRef.current = true;

    const abortController = new AbortController();
    const listenerOptions = { signal: abortController.signal, passive: true } as const;
    let idleTimeout: ReturnType<typeof setTimeout>;

    const releaseIfLocked = () => {
      if (!scrollLockedRef.current) return;
      releaseScrollLock();
    };

    const restartIdleTimeout = () => {
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(releaseIfLocked, SCROLL_IDLE_MS);
    };

    const onUserInterrupt = () => {
      releaseIfLocked();
    };

    const onScrollKeyDown = (event: KeyboardEvent) => {
      if (SCROLL_INTERRUPT_KEYS.has(event.key)) {
        releaseIfLocked();
      }
    };

    window.addEventListener("scrollend", releaseIfLocked, {
      signal: abortController.signal,
    });
    window.addEventListener("scroll", restartIdleTimeout, listenerOptions);
    window.addEventListener("wheel", onUserInterrupt, listenerOptions);
    window.addEventListener("touchstart", onUserInterrupt, listenerOptions);
    window.addEventListener("touchmove", onUserInterrupt, listenerOptions);
    window.addEventListener("keydown", onScrollKeyDown, listenerOptions);

    restartIdleTimeout();

    scrollLockCleanupRef.current = () => {
      clearTimeout(idleTimeout);
      abortController.abort();
    };
  };

  // Nav unmounts while a smooth scroll is still running (e.g. user opens search).
  useEffect(() => () => releaseScrollLock(), []);

  useEffect(() => {
    const categoryHeaders = categories
      .map((category) => document.getElementById(category.id))
      .filter((element): element is HTMLElement => element !== null);

    if (categoryHeaders.length === 0) return;

    const syncActiveCategoryWithViewport = (entries: IntersectionObserverEntry[]) => {
      // Ignore viewport changes during programmatic scroll-to-category.
      if (scrollLockedRef.current) return;

      const visibleHeaders = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      if (visibleHeaders.length > 0) {
        setActiveId(visibleHeaders[0].target.id);
      }
    };

    const observer = new IntersectionObserver(syncActiveCategoryWithViewport, {
      rootMargin: `-${STICKY_OFFSET_PX}px 0px -60% 0px`,
      threshold: 0,
    });

    for (const header of categoryHeaders) {
      observer.observe(header);
    }

    return () => observer.disconnect();
    // Category list is fixed for this mount.
  }, []);

  const scrollToCategory = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;

    setActiveId(id);
    acquireScrollLock();

    const top =
      target.getBoundingClientRect().top + window.scrollY - STICKY_OFFSET_PX;
    window.scrollTo({ top, behavior: "smooth" });
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
      className="sticky top-0 z-40 border-b border-foreground/10 bg-background/95 backdrop-blur"
    >
      <div className="site-container flex items-center gap-1 px-4 py-2 md:px-6">
        {canScrollLeft ? (
          <button
            type="button"
            onClick={() => scrollByAmount("left")}
            aria-label={copy.scrollCategoriesLeft}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-foreground/15 text-foreground/80 hover:bg-foreground/5 sm:flex"
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
                data-category-id={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition ${
                  isActive
                    ? "bg-accent text-white"
                    : "text-foreground/70 hover:text-foreground"
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
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-foreground/15 text-foreground/80 hover:bg-foreground/5 sm:flex"
          >
            ›
          </button>
        ) : null}
      </div>
    </nav>
  );
}
