export type PollActiveMenuVersionOptions = {
  intervalMs?: number;
  maxAttempts?: number;
  fetchActiveVersion?: () => Promise<number | undefined>;
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_MAX_ATTEMPTS = 90;

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function defaultFetchActiveVersion(): Promise<number | undefined> {
  const response = await fetch("/api/menu/active-version", { cache: "no-store" });
  if (!response.ok) return undefined;
  const body = (await response.json()) as { version?: unknown };
  return typeof body.version === "number" ? body.version : undefined;
}

export async function pollUntilActiveMenuVersion(
  expectedVersion: number,
  options: PollActiveMenuVersionOptions = {},
): Promise<void> {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const fetchActiveVersion = options.fetchActiveVersion ?? defaultFetchActiveVersion;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const version = await fetchActiveVersion();
    if (version === expectedVersion) return;
    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  throw new Error(
    `Live menu did not reach v${expectedVersion} within ${Math.round((maxAttempts * intervalMs) / 1000)}s. ` +
      "Git may be updated; check RicoS-Menu GitHub Actions (CI revalidate) and Vercel cache.",
  );
}
