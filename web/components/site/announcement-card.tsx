"use client";

import { useAnnouncement } from "@/lib/announcement-context";
import { isAnnouncementDismissed, markAnnouncementDismissed } from "@/lib/announcement-dismiss";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export function AnnouncementCard() {
  const announcement = useAnnouncement();
  const { language } = useLanguage();
  const copy = getAppStrings(language);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!announcement) {
      setVisible(false);
      return;
    }
    setVisible(!isAnnouncementDismissed(announcement.fingerprint));
  }, [announcement]);

  const dismiss = useCallback(() => {
    if (!announcement) return;
    markAnnouncementDismissed(announcement.fingerprint);
    setVisible(false);
  }, [announcement]);

  if (!announcement || !visible) return null;

  const ctaLabel =
    language === "en"
      ? announcement.ctaLabelEn?.trim() || copy.announcementCtaDefault
      : announcement.ctaLabelEs?.trim() || copy.announcementCtaDefault;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-3 pt-4 md:px-6">
      <div
        className="relative rounded-2xl border border-accent/20 bg-accent p-5 pr-12 text-white shadow-lg"
        role="status"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label={copy.announcementDismiss}
          className="absolute right-3 top-3 rounded-md px-2 py-1 text-sm text-white/80 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
        <p className="text-lg font-bold leading-snug md:text-xl">
          {announcement.message}
        </p>
        {announcement.ctaUrl ? (
          <div className="mt-4">
            <Link
              href={announcement.ctaUrl}
              className="inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-black text-accent hover:brightness-95"
            >
              {ctaLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
