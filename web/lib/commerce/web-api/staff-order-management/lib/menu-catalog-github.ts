import { parseMenuCatalogFile, type ParsedMenuCatalogFile } from "@ricos/shared";
import type { GitHubCatalogTarget } from "./menu-catalog-remote";

export const GITHUB_API_VERSION = "2026-03-10";

export type GitHubContentResponse = {
  sha?: string;
  content?: string;
  encoding?: string;
};

export function encodeGitHubContentsPath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function githubContentsUrl(target: GitHubCatalogTarget): string {
  const encodedPath = encodeGitHubContentsPath(target.path);
  return `https://api.github.com/repos/${target.owner}/${target.repo}/contents/${encodedPath}`;
}

export function githubHeaders(token: string): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": "RicoS-menu-catalog",
    "x-github-api-version": GITHUB_API_VERSION,
  };
}

export async function githubJson<T>(
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

export function decodeGitHubBase64(content: string): string {
  return Buffer.from(content.replaceAll("\n", ""), "base64").toString("utf8");
}

export async function fetchGitHubMenuCatalogContents(
  target: GitHubCatalogTarget,
  token?: string,
): Promise<ParsedMenuCatalogFile> {
  const authToken = token?.trim() || process.env.GITHUB_TOKEN?.trim();
  const headers: HeadersInit = {
    accept: "application/vnd.github+json",
    "user-agent": "RicoS-menu-catalog",
    "x-github-api-version": GITHUB_API_VERSION,
  };
  if (authToken) {
    (headers as Record<string, string>).authorization = `Bearer ${authToken}`;
  }

  const url = `${githubContentsUrl(target)}?ref=${encodeURIComponent(target.branch)}`;
  const response = await githubJson<GitHubContentResponse>(url, { headers, cache: "no-store" });
  if (!response.ok) {
    throw new Error(response.message);
  }

  const file = response.body;
  if (file.encoding !== "base64" || !file.content) {
    throw new Error("GitHub menu file response was incomplete");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(decodeGitHubBase64(file.content));
  } catch {
    throw new Error("GitHub menu file is not valid JSON");
  }

  return parseMenuCatalogFile(raw);
}
