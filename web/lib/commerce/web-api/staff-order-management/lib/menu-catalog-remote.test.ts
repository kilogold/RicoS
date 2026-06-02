import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const originalUrl = process.env.MENU_PUBLISH_MENU_JSON_URL;

mock.module("./menu-catalog-github", () => ({
  fetchGitHubMenuCatalogContents: async (target: { branch: string }) => {
    if (target.branch === "preview") {
      return {
        catalogVersion: 3,
        publishedAtIso: "2026-01-01T00:00:00.000Z",
        catalog: {
          restaurant: { en: "r", es: "r" },
          menuName: { en: "m", es: "m" },
          themes: {},
          categories: [],
          orderFees: { serviceFeeRate: 0.05 },
        },
      };
    }
    throw new Error("unexpected branch");
  },
}));

const { fetchRemoteMenuCatalog, parseGitHubTargetFromCatalogUrl } = await import(
  "./menu-catalog-remote"
);

describe("parseGitHubTargetFromCatalogUrl", () => {
  beforeEach(() => {
    process.env.MENU_PUBLISH_MENU_JSON_URL =
      "https://raw.githubusercontent.com/org/RicoS-Menu/preview/menu.json";
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.MENU_PUBLISH_MENU_JSON_URL;
    } else {
      process.env.MENU_PUBLISH_MENU_JSON_URL = originalUrl;
    }
  });

  test("parses owner, repo, branch, and path", () => {
    expect(parseGitHubTargetFromCatalogUrl()).toEqual({
      owner: "org",
      repo: "RicoS-Menu",
      branch: "preview",
      path: "menu.json",
    });
  });
});

describe("fetchRemoteMenuCatalog", () => {
  beforeEach(() => {
    process.env.MENU_PUBLISH_MENU_JSON_URL =
      "https://raw.githubusercontent.com/org/RicoS-Menu/preview/menu.json";
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.MENU_PUBLISH_MENU_JSON_URL;
    } else {
      process.env.MENU_PUBLISH_MENU_JSON_URL = originalUrl;
    }
  });

  test("loads catalog via GitHub contents helper", async () => {
    const parsed = await fetchRemoteMenuCatalog();
    expect(parsed.catalogVersion).toBe(3);
  });
});
