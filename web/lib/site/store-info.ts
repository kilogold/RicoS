import type { Language } from "@ricos/shared";
import {
  formatStoreMinutesAmPm,
  parseStoreTimeToMinutes,
} from "@/lib/commerce/domain/store-hours";

export type StoreInfo = {
  name: string;
  addressLines: string[];
  phoneDisplay: string;
  phoneDial: string;
  googleMapsEmbedUrl: string;
  googleMapsDirectionsUrl: string;
  instagramUrl: string;
  facebookUrl: string;
};

const PUBLIC_STORE_HOURS = {
  weekdays: { open: "08:00", close: "22:00" },
  weekends: { open: "08:00", close: "23:00" },
} as const;

export const STORE_INFO: StoreInfo = {
  name: "RicoS",
  addressLines: ["2030 Albizu Campos", "Suite 1", "Aguadilla PR, 00603"],
  phoneDisplay: "(787) 555-0100",
  phoneDial: "+17875550100",
  googleMapsEmbedUrl:
    "https://maps.google.com/maps?q=18.4608411%2C-67.1531894%20%28RicoS%29&z=16&output=embed",
  googleMapsDirectionsUrl: "https://maps.app.goo.gl/1DRvHJQFyWhtDUxw9",
  instagramUrl: "https://www.instagram.com/ricosrest/",
  facebookUrl: "https://www.facebook.com/ricosrest",
};

function formatPublicStoreHoursRange(openRaw: string, closeRaw: string, language: Language): string {
  const open = parseStoreTimeToMinutes(openRaw);
  const close = parseStoreTimeToMinutes(closeRaw);
  if (open === null || close === null) {
    return language === "en" ? "Unavailable" : "No disponible";
  }
  const formattedOpen = formatStoreMinutesAmPm(open);
  const formattedClose = formatStoreMinutesAmPm(close);
  return `${formattedOpen} - ${formattedClose}`;
}

export function formatStoreHoursLines(language: Language): string[] {
  const weekdayLabel = language === "en" ? "Weekdays" : "Dias en semana";
  const weekendLabel = language === "en" ? "Weekends" : "Fines de semana";

  return [
    `${weekdayLabel}: ${formatPublicStoreHoursRange(
      PUBLIC_STORE_HOURS.weekdays.open,
      PUBLIC_STORE_HOURS.weekdays.close,
      language,
    )}`,
    `${weekendLabel}: ${formatPublicStoreHoursRange(
      PUBLIC_STORE_HOURS.weekends.open,
      PUBLIC_STORE_HOURS.weekends.close,
      language,
    )}`,
  ];
}
