"use client";

import { useEffect, useState } from "react";

const TICK_MS = 60_000;

/** Re-renders every minute so theme availability can update without a page reload. */
export function useStoreLocalNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  return now;
}
