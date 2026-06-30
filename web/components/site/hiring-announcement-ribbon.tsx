"use client";

import { useLanguage } from "@/lib/language-context";
import Link from "next/link";
import { useEffect, useState } from "react";

type HiringAnnouncementRibbonProps = {
  message?: string;
};

const COOKIE_NAME = "ricos_hiring_announcement_seen";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

function hasSeenHiringAnnouncement() {
  if (typeof document === "undefined") return true;
  return document.cookie
    .split(";")
    .some((cookie) => cookie.trim().startsWith(`${COOKIE_NAME}=`));
}

function markHiringAnnouncementSeen() {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=1; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

export function HiringAnnouncementRibbon({ message }: HiringAnnouncementRibbonProps) {
  const text = message?.trim();
  const [visible, setVisible] = useState(false);
  const { language } = useLanguage();
  const applyLabel = language === "en" ? "Apply" : "Aplicar";
  const ignoreLabel = language === "en" ? "Ignore" : "Ignorar";

  useEffect(() => {
    if (!text || hasSeenHiringAnnouncement()) return;
    markHiringAnnouncementSeen();
    const frameId = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frameId);
  }, [text]);

  if (!text) return null;
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/35 p-4 backdrop-blur-[2px] sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hiring-announcement-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#07182b] p-5 text-white shadow-2xl">
        <h2
          id="hiring-announcement-title"
          className="text-2xl font-black leading-tight text-[#f4c430]"
        >
          {text}
        </h2>

        <div className="mt-5 flex gap-3">
          <Link
            href="/employment"
            onClick={() => setVisible(false)}
            className="flex-1 rounded-xl bg-[#f4c430] px-4 py-3 text-center text-sm font-black text-[#0c2340] hover:brightness-95"
          >
            {applyLabel}
          </Link>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            {ignoreLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
