import { handleStaffMenuPublishRequest } from "@/lib/commerce/web-api/staff-order-management/adapters/http";
import { normalizeMenuCatalogFile } from "@/lib/commerce/web-api/staff-order-management/lib/menu-editor-source";
import { requireStaffPublishAuth } from "@/lib/commerce/web-api/staff-order-management/lib/verify-staff-publish-auth";
import {
  computeMenuContentHash,
  parseMenuCatalogFile,
  type MenuCatalogFile,
} from "@ricos/shared";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GITHUB_API_VERSION = "2026-03-10";
const JSON_INDENT_SPACES = 2;
const HTTP_CONFLICT = 409;
const MENU_JSON_PATH_PARTS = ["packages", "shared", "src", "menu.json"];

type GitHubContentResponse = {
  sha?: string;
  content?: string;
  encoding?: string;
};

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

function splitRawGitHubRefAndPath(parts: string[]): { branch: string; path: string } {
  const suffixStart = parts.findIndex((_, index) =>
    MENU_JSON_PATH_PARTS.every((part, partIndex) => parts[index + partIndex] === part),
  );
  if (suffixStart === -1) {
    const [branch, ...pathParts] = parts;
    if (!branch || pathParts.length === 0) {
      throw new Error("MENU_PUBLISH_MENU_JSON_URL must include branch and path");
    }
    return { branch, path: pathParts.join("/") };
  }

  const refParts = parts.slice(0, suffixStart);
  if (refParts.length === 0) {
    throw new Error("MENU_PUBLISH_MENU_JSON_URL must include a branch before packages/shared/src/menu.json");
  }

  if (refParts[0] === "refs" && refParts[1] === "heads" && refParts.length > 2) {
    return {
      branch: refParts.slice(2).join("/"),
      path: parts.slice(suffixStart).join("/"),
    };
  }

  return {
    branch: refParts.join("/"),
    path: parts.slice(suffixStart).join("/"),
  };
}

function parseGitHubTarget(): { owner: string; repo: string; branch: string; path: string } {
  const rawUrl = process.env.MENU_PUBLISH_MENU_JSON_URL?.trim();
  if (!rawUrl) {
    throw new Error("MENU_PUBLISH_MENU_JSON_URL is required");
  }
  const url = new URL(rawUrl);
  if (url.hostname !== "raw.githubusercontent.com") {
    throw new Error("MENU_PUBLISH_MENU_JSON_URL must use raw.githubusercontent.com");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const [owner, repo, ...refAndPathParts] = parts;
  if (!owner || !repo || refAndPathParts.length < 2) {
    throw new Error("MENU_PUBLISH_MENU_JSON_URL must include owner, repo, branch, and path");
  }
  const { branch, path } = splitRawGitHubRefAndPath(refAndPathParts);
  return { owner, repo, branch, path };
}

function githubHeaders(token: string): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": "RicoS-menu-editor",
    "x-github-api-version": GITHUB_API_VERSION,
  };
}

async function githubJson<T>(
  url: string,
  init: RequestInit,
): Promise<{ ok: true; body: T } | { ok: false; status: number; message: string }> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    return {
      ok: false,
      status: 502,
      message: `GitHub request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: body.message ?? `GitHub request failed with HTTP ${response.status}`,
    };
  }
  return { ok: true, body: body as T };
}

function decodeGitHubBase64(content: string): string {
  return Buffer.from(content.replaceAll("\n", ""), "base64").toString("utf8");
}

function buildNextMenu(submittedMenu: MenuCatalogFile, currentMenu: MenuCatalogFile): MenuCatalogFile {
  return {
    ...submittedMenu,
    catalogVersion: currentMenu.catalogVersion + 1,
    publishedAt: new Date().toISOString(),
  };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
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
    target = parseGitHubTarget();
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }

  const encodedPath = target.path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const contentsUrl = `https://api.github.com/repos/${target.owner}/${target.repo}/contents/${encodedPath}`;
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

  let nextMenu: MenuCatalogFile;
  try {
    nextMenu = buildNextMenu(body.menu as MenuCatalogFile, currentMenu);
    parseMenuCatalogFile(nextMenu);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 400);
  }

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

  const publishResponse = await handleStaffMenuPublishRequest();
  const publishBody = await readJsonResponse(publishResponse);
  if (!publishResponse.ok) {
    const message =
      publishBody && typeof publishBody === "object" && "error" in publishBody
        ? String((publishBody as { error: unknown }).error)
        : `Publish failed with HTTP ${publishResponse.status}`;
    return jsonError(message, publishResponse.status);
  }

  return NextResponse.json({
    committedVersion: nextMenu.catalogVersion,
    publishedAt: nextMenu.publishedAt,
    baseContentHash: await computeMenuContentHash(nextMenu),
    commitSha: commitResponse.body.commit?.sha,
    commitUrl: commitResponse.body.commit?.html_url,
    contentUrl: commitResponse.body.content?.html_url,
    publish: publishBody,
  });
}
