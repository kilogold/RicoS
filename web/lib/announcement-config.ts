export type AnnouncementConfig = {
  fingerprint: string;
  message: string;
  ctaUrl?: string;
  ctaLabelEn?: string;
  ctaLabelEs?: string;
};

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Stable key so a new message/CTA re-shows after dismiss. */
function fingerprintFor(message: string, ctaUrl: string | undefined): string {
  return `${message}\0${ctaUrl ?? ""}`;
}

export function parseAnnouncementConfig(): AnnouncementConfig | null {
  const message = trimEnv(process.env.ANNOUNCEMENT_MESSAGE);
  if (!message) return null;

  const ctaUrl = trimEnv(process.env.ANNOUNCEMENT_CTA_URL);
  const ctaLabelEn = trimEnv(process.env.ANNOUNCEMENT_CTA_LABEL_EN);
  const ctaLabelEs = trimEnv(process.env.ANNOUNCEMENT_CTA_LABEL_ES);

  return {
    fingerprint: fingerprintFor(message, ctaUrl),
    message,
    ...(ctaUrl ? { ctaUrl } : {}),
    ...(ctaLabelEn ? { ctaLabelEn } : {}),
    ...(ctaLabelEs ? { ctaLabelEs } : {}),
  };
}
