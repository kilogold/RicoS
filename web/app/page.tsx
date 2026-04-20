"use client";

import { CartBar, MenuBoard } from "@/components/menu-board";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { MENU, resolveLocalizedText } from "@ricos/shared";

export default function Home() {
  const { language, setLanguage } = useLanguage();
  const copy = getAppStrings(language);

  return (
    <main className="relative pb-32">
      <div className="border-b border-white/10 bg-gradient-to-br from-[#0c2340] via-[#0a1f38] to-[#07182b] px-4 py-12 md:px-10">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#f4c430]">
              {copy.homeTagline}
            </p>
            <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-black/20 px-2 py-1">
              <span className="text-xs text-white/70">{copy.languageLabel}</span>
              <button
                type="button"
                onClick={() => setLanguage("es")}
                className={`rounded px-2 py-1 text-xs ${
                  language === "es"
                    ? "bg-[#f4c430] text-[#0c2340]"
                    : "text-white/75 hover:bg-white/10"
                }`}
              >
                {copy.spanishLabel}
              </button>
              <button
                type="button"
                onClick={() => setLanguage("en")}
                className={`rounded px-2 py-1 text-xs ${
                  language === "en"
                    ? "bg-[#f4c430] text-[#0c2340]"
                    : "text-white/75 hover:bg-white/10"
                }`}
              >
                {copy.englishLabel}
              </button>
            </div>
          </div>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            {resolveLocalizedText(MENU.menuName, language)}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/75">
            {copy.homeSubtitle}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-12 md:px-6">
        <MenuBoard categories={MENU.categories} />
      </div>

      <CartBar />
    </main>
  );
}
