"use client";

import { useStoreSession } from "./store-session-context";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function formatCountdownMs(millisecondsRemaining: number): string {
  const MILLISECONDS_PER_SECOND = 1000;
  const SECONDS_PER_MINUTE = 60;
  const SECONDS_DISPLAY_PAD_LENGTH = 2;
  const SECONDS_DISPLAY_PAD_CHARACTER = "0";
  const COUNTDOWN_EXHAUSTED_LABEL = "0:00";

  if (millisecondsRemaining <= 0) {
    return COUNTDOWN_EXHAUSTED_LABEL;
  }
  const totalSecondsRoundedUp = Math.ceil(
    millisecondsRemaining / MILLISECONDS_PER_SECOND,
  );
  const wholeMinutes = Math.floor(totalSecondsRoundedUp / SECONDS_PER_MINUTE);
  const secondsWithinCurrentMinute = totalSecondsRoundedUp % SECONDS_PER_MINUTE;
  const secondsPartPadded = secondsWithinCurrentMinute
    .toString()
    .padStart(SECONDS_DISPLAY_PAD_LENGTH, SECONDS_DISPLAY_PAD_CHARACTER);
  return `${wholeMinutes}:${secondsPartPadded}`;
}

export function StoreHoursBanners() {
  const { status, shoppingEnabled, closesAtIso } = useStoreSession();
  const { language } = useLanguage();
  const copy = getAppStrings(language);
  const router = useRouter();

  const closesAt = useMemo(() => new Date(closesAtIso).getTime(), [closesAtIso]);
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (status !== "last_call" || !shoppingEnabled) {
      return;
    }

    const COUNTDOWN_TICK_INTERVAL_MS = 1000;
    const IMMEDIATE_SCHEDULE_DELAY_MS = 0;
    const REMAINING_MS_WHEN_COUNTDOWN_DONE = 0;

    const updateCountdownFromWallClock = () => {
      const nowMilliseconds = Date.now();
      const remainingMilliseconds = Math.max(
        REMAINING_MS_WHEN_COUNTDOWN_DONE,
        closesAt - nowMilliseconds,
      );
      setRemainingMs(remainingMilliseconds);
      if (remainingMilliseconds <= REMAINING_MS_WHEN_COUNTDOWN_DONE) {
        router.refresh();
      }
    };

    const initialTimeoutHandle = setTimeout(
      updateCountdownFromWallClock,
      IMMEDIATE_SCHEDULE_DELAY_MS,
    );
    const recurringIntervalHandle = setInterval(
      updateCountdownFromWallClock,
      COUNTDOWN_TICK_INTERVAL_MS,
    );
    return () => {
      clearTimeout(initialTimeoutHandle);
      clearInterval(recurringIntervalHandle);
    };
  }, [closesAt, router, shoppingEnabled, status]);

  const stickyBar =
    "sticky top-0 z-[60] border-b px-4 py-3 text-center text-sm shadow-md backdrop-blur";

  if (status === "closed") {
    return (
      <div
        role="status"
        className={`${stickyBar} border-amber-400/40 bg-amber-950/90 font-medium text-amber-50`}
      >
        {copy.storeClosedBanner}
      </div>
    );
  }

  if (status === "last_call" && shoppingEnabled) {
    return (
      <div
        role="status"
        className={`${stickyBar} border-red-500/50 bg-red-950/90 font-semibold text-red-50`}
      >
        {copy.lastCallBannerPrefix}{" "}
        <span className="tabular-nums">{formatCountdownMs(remainingMs)}</span>
      </div>
    );
  }

  return null;
}
