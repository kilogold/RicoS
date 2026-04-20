import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type IdempotencyStore = {
  isCommitted(eventId: string): Promise<boolean>;
  markCommitted(eventId: string): Promise<void>;
};

type Serialized = { eventIds: string[] };

const MAX_IDS = 50_000;

function defaultStorePath(): string {
  return path.join(__dirname, "..", ".kitchen-processed-events.json");
}

export function createFileIdempotencyStore(storePath: string): IdempotencyStore {
  let lock = Promise.resolve();

  async function withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = lock;
    lock = prev.then(() => next);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async function load(): Promise<Set<string>> {
    try {
      const raw = await readFile(storePath, "utf8");
      const parsed = JSON.parse(raw) as Serialized;
      const ids = Array.isArray(parsed.eventIds) ? parsed.eventIds : [];
      return new Set(ids);
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
      if (code === "ENOENT") {
        return new Set();
      }
      throw err;
    }
  }

  async function save(ids: Set<string>): Promise<void> {
    await mkdir(path.dirname(storePath), { recursive: true });
    const arr = [...ids];
    if (arr.length > MAX_IDS) {
      arr.splice(0, arr.length - MAX_IDS);
    }
    const body: Serialized = { eventIds: arr };
    await writeFile(storePath, JSON.stringify(body, null, 0) + "\n", "utf8");
  }

  return {
    async isCommitted(eventId: string): Promise<boolean> {
      return withLock(async () => {
        const ids = await load();
        return ids.has(eventId);
      });
    },

    async markCommitted(eventId: string): Promise<void> {
      return withLock(async () => {
        const ids = await load();
        ids.add(eventId);
        await save(ids);
      });
    },
  };
}

export function resolveIdempotencyStorePath(explicit?: string): string {
  if (explicit && explicit.trim()) {
    return path.resolve(explicit.trim());
  }
  return defaultStorePath();
}
