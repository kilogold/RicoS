import {
  decodeGitHubBase64,
  githubContentsUrl,
  githubHeaders,
  githubJson,
  type GitHubContentResponse,
} from "@/lib/commerce/web-api/staff-order-management/lib/menu-catalog-github";
import { parseGitHubTargetFromCatalogUrl } from "@/lib/commerce/web-api/staff-order-management/lib/menu-catalog-remote";
import { hasMenuCatalogChanges } from "@/lib/commerce/web-api/staff-order-management/lib/menu-editor-catalog";
import { normalizeMenuCatalogFile } from "@/lib/commerce/web-api/staff-order-management/lib/menu-editor-source";
import { requireStaffPublishAuth } from "@/lib/commerce/web-api/staff-order-management/lib/verify-staff-publish-auth";
import {
  computeMenuContentHash,
  parseMenuCatalogFile,
  type MenuCatalogFile,
} from "@ricos/shared";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const JSON_INDENT_SPACES = 2;
const HTTP_CONFLICT = 409;

type GitHubCommitResponse = {
  commit?: {
    sha?: string;
    html_url?: string;
  };
  content?: {
    sha?: string;
    html_url?: string;
  };
  message?: string;
};

function jsonError(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

function buildNextMenu(submittedMenu: MenuCatalogFile, currentMenu: MenuCatalogFile): MenuCatalogFile {
  return {
    ...submittedMenu,
    catalogVersion: currentMenu.catalogVersion + 1,
    publishedAt: new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  const unauthorized = requireStaffPublishAuth(req);
  if (unauthorized) return unauthorized;

  let body: { menu?: unknown; baseContentHash?: unknown };
  try {
    body = (await req.json()) as { menu?: unknown };
  } catch {
    return jsonError("invalid_json", 400);
  }

  if (!body.menu || typeof body.menu !== "object" || Array.isArray(body.menu)) {
    return jsonError("menu is required", 400);
  }
  if (typeof body.baseContentHash !== "string" || !body.baseContentHash.trim()) {
    return jsonError("baseContentHash is required", 400);
  }

  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return jsonError("GITHUB_TOKEN is required", 500);

  let target: { owner: string; repo: string; branch: string; path: string };
  try {
    target = parseGitHubTargetFromCatalogUrl();
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }

  const contentsUrl = githubContentsUrl(target);
  const headers = githubHeaders(token);

  const currentResponse = await githubJson<GitHubContentResponse>(
    `${contentsUrl}?ref=${encodeURIComponent(target.branch)}`,
    { headers, cache: "no-store" },
  );
  if (!currentResponse.ok) {
    return jsonError(currentResponse.message, currentResponse.status);
  }
  const currentFile = currentResponse.body;
  if (!currentFile.sha || currentFile.encoding !== "base64" || !currentFile.content) {
    return jsonError("GitHub menu file response was incomplete", 502);
  }

  let currentMenu: MenuCatalogFile;
  let currentContentHash: string;
  try {
    currentMenu = normalizeMenuCatalogFile(JSON.parse(decodeGitHubBase64(currentFile.content)));
    parseMenuCatalogFile(currentMenu);
    currentContentHash = await computeMenuContentHash(currentMenu);
  } catch (err) {
    return jsonError(
      `Current GitHub menu.json is invalid: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  }

  if (body.baseContentHash !== currentContentHash) {
    return NextResponse.json(
      {
        error:
          "Someone else published a newer menu. Refresh to discard your pending changes and start again.",
        currentVersion: currentMenu.catalogVersion,
      },
      { status: HTTP_CONFLICT },
    );
  }

  let submittedMenu: MenuCatalogFile;
  try {
    submittedMenu = normalizeMenuCatalogFile(body.menu);
    parseMenuCatalogFile(submittedMenu);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 400);
  }

  if (!hasMenuCatalogChanges(submittedMenu, currentMenu)) {
    return jsonError("No catalog changes to publish.", 400);
  }

  let nextMenu: MenuCatalogFile;
  try {
    nextMenu = buildNextMenu(submittedMenu, currentMenu);
    parseMenuCatalogFile(nextMenu);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 400);
  }

  const nextContentHash = await computeMenuContentHash(nextMenu);
  const content = `${JSON.stringify(nextMenu, null, JSON_INDENT_SPACES)}\n`;
  const commitResponse = await githubJson<GitHubCommitResponse>(contentsUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `Publish menu v${nextMenu.catalogVersion}`,
      content: Buffer.from(content, "utf8").toString("base64"),
      sha: currentFile.sha,
      branch: target.branch,
    }),
  });
  if (!commitResponse.ok) {
    const status = commitResponse.status === HTTP_CONFLICT ? HTTP_CONFLICT : commitResponse.status;
    return jsonError(commitResponse.message, status);
  }

  return NextResponse.json({
    committedVersion: nextMenu.catalogVersion,
    publishedAt: nextMenu.publishedAt,
    baseContentHash: nextContentHash,
    commitSha: commitResponse.body.commit?.sha,
    commitUrl: commitResponse.body.commit?.html_url,
    contentUrl: commitResponse.body.content?.html_url,
  });
}
