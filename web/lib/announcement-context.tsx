"use client";

import type { AnnouncementConfig } from "@/lib/announcement-config";
import { createContext, useContext, type ReactNode } from "react";

const AnnouncementContext = createContext<AnnouncementConfig | null>(null);

export function AnnouncementProvider({
  value,
  children,
}: {
  value: AnnouncementConfig | null;
  children: ReactNode;
}) {
  return (
    <AnnouncementContext.Provider value={value}>{children}</AnnouncementContext.Provider>
  );
}

export function useAnnouncement(): AnnouncementConfig | null {
  return useContext(AnnouncementContext);
}
