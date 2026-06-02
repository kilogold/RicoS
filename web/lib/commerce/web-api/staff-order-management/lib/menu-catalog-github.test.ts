import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const originalToken = process.env.GITHUB_TOKEN;

const fetchMock = mock(() => Promise.resolve(new Response()));

globalThis.fetch = fetchMock as typeof fetch;

const { decodeGitHubBase64, fetchGitHubMenuCatalogContents } = await import("./menu-catalog-github");

describe("decodeGitHubBase64", () => {
  test("decodes GitHub content payload", () => {
    const encoded = Buffer.from('{"catalogVersion":1}', "utf8").toString("base64");
    expect(decodeGitHubBase64(encoded)).toBe('{"catalogVersion":1}');
  });
});

describe("fetchGitHubMenuCatalogContents", () => {
  const target = {
    owner: "org",
    repo: "RicoS-Menu",
    branch: "preview",
    path: "menu.json",
  };

  beforeEach(() => {
    fetchMock.mockClear();
    process.env.GITHUB_TOKEN = "test-token";
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  });

  test("GETs GitHub contents API and parses menu", async () => {
    const menu = {
      catalogVersion: 2,
      publishedAt: "2026-01-02T00:00:00.000Z",
      restaurant: { en: "RicoS", es: "RicoS" },
      menuName: { en: "Menu", es: "Menu" },
      orderFees: { serviceFeeRate: 0.05 },
      themes: {},
      categories: [],
    };
    const content = Buffer.from(JSON.stringify(menu), "utf8").toString("base64");
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ encoding: "base64", content }), { status: 200 }),
      ),
    );

    const parsed = await fetchGitHubMenuCatalogContents(target);
    expect(parsed.catalogVersion).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/repos/org/RicoS-Menu/contents/menu.json?ref=preview");
    expect(init).toMatchObject({ cache: "no-store" });
  });
});
