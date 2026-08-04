import { hasMenuCatalogChanges } from "@/lib/commerce/web-api/staff-order-management/lib/menu-editor-catalog";
import { pollUntilActiveMenuVersion } from "@/lib/commerce/web-api/staff-order-management/lib/poll-active-menu-version";
import type { MenuCatalogFile } from "@ricos/shared";

const HTTP_CONFLICT = 409;

type CommitPublishResult = {
  commitSha?: string;
  committedVersion?: number;
  publishedAt?: string;
  baseContentHash?: string;
  error?: string;
};

async function readCommitPublishResponse(response: Response): Promise<CommitPublishResult> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as CommitPublishResult;
  } catch {
    return { error: text };
  }
}

function formatPublishSuccessMessage(committedVersion: number | undefined, commitSha?: string): string {
  const versionPart =
    committedVersion !== undefined ? `Catalog v${committedVersion} is live.` : "Catalog is live.";
  if (!commitSha) return versionPart;
  return `${versionPart} Commit ${commitSha.slice(0, 7)}.`;
}

export type PublishOutcome =
  | { ok: true; status: string; menu: MenuCatalogFile; baseContentHash: string }
  | { ok: false; error: string; conflict: boolean; status: null };

export async function commitMenuCatalog(params: {
  menu: MenuCatalogFile;
  baselineMenu: MenuCatalogFile;
  baseContentHash: string;
}): Promise<PublishOutcome> {
  const { menu, baselineMenu, baseContentHash } = params;

  if (!hasMenuCatalogChanges(menu, baselineMenu)) {
    return { ok: false, error: "No catalog changes to publish.", conflict: false, status: null };
  }

  const response = await fetch("/api/staff/admin/menu/commit-publish", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ menu, baseContentHash }),
  });
  const body = await readCommitPublishResponse(response);

  if (!response.ok) {
    const conflict = response.status === HTTP_CONFLICT;
    return {
      ok: false,
      conflict,
      status: null,
      error: conflict
        ? (body.error ??
            "Someone else published a newer menu. Refresh to discard your changes and start again.")
        : (body.error ?? `HTTP ${response.status}`),
    };
  }

  const committedVersion = body.committedVersion;
  const publishedAt = body.publishedAt;
  if (committedVersion === undefined) {
    return {
      ok: false,
      error: "Publish succeeded but committedVersion was missing.",
      conflict: false,
      status: null,
    };
  }

  await pollUntilActiveMenuVersion(committedVersion);

  const nextMenu = publishedAt
    ? { ...menu, catalogVersion: committedVersion, publishedAt }
    : menu;

  return {
    ok: true,
    status: formatPublishSuccessMessage(committedVersion, body.commitSha),
    menu: nextMenu,
    baseContentHash: body.baseContentHash ?? baseContentHash,
  };
}
