import type { Language } from "@ricos/shared";
import {
  formatStoreMinutes24h,
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
  employmentFormUrl: string;
};

export const STORE_INFO: StoreInfo = {
  name: "RicoS",
  addressLines: ["123 Calle Principal", "Aguadilla, PR 00603"],
  phoneDisplay: "(787) 555-0100",
  phoneDial: "+17875550100",
  googleMapsEmbedUrl:
    "https://maps.google.com/maps?q=123%20Calle%20Principal%2C%20Aguadilla%2C%20PR%2000603&output=embed",
  googleMapsDirectionsUrl:
    "https://maps.google.com/?q=123%20Calle%20Principal%2C%20Aguadilla%2C%20PR%2000603",
  instagramUrl: "https://instagram.com/ricos",
  facebookUrl: "https://facebook.com/ricos",
  employmentFormUrl: "https://docs.google.com/forms/d/e/PLACEHOLDER/viewform",
};

export function formatStoreHoursLabel(language: Language): string {
  const open = parseStoreTimeToMinutes(process.env.STORE_OPEN_TIME);
  const close = parseStoreTimeToMinutes(process.env.STORE_CLOSE_TIME);
  if (open === null || close === null) {
    return language === "en" ? "Unavailable" : "No disponible";
  }
  const formattedOpen = language === "en" ? formatStoreMinutesAmPm(open) : formatStoreMinutes24h(open);
  const formattedClose =
    language === "en" ? formatStoreMinutesAmPm(close) : formatStoreMinutes24h(close);
  return `${formattedOpen} - ${formattedClose}`;
}
