import { afterEach, describe, expect, test } from "bun:test";
import { parseLanguage, writeLanguageCookie } from "./language";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

afterEach(() => {
  if (originalDocument) {
    Object.defineProperty(globalThis, "document", originalDocument);
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }
});

describe("parseLanguage", () => {
  test("accepts English and Spanish", () => {
    expect(parseLanguage("en")).toBe("en");
    expect(parseLanguage("es")).toBe("es");
  });

  test("defaults to Spanish for missing or invalid preferences", () => {
    for (const value of [undefined, null, "", "fr", "EN", "en-US", " en "]) {
      expect(parseLanguage(value)).toBe("es");
    }
  });
});

describe("writeLanguageCookie", () => {
  test("persists each language for one year across site paths", () => {
    const documentStub = { cookie: "" };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: documentStub,
    });

    for (const language of ["en", "es"] as const) {
      writeLanguageCookie(language);
      expect(documentStub.cookie).toBe(
        `ricos.language=${language}; Max-Age=31536000; Path=/; SameSite=Lax`,
      );
    }
  });

  test("does not throw when cookie writes are blocked", () => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        set cookie(_value: string) {
          throw new DOMException("Cookies are blocked", "SecurityError");
        },
      },
    });

    expect(() => writeLanguageCookie("en")).not.toThrow();
  });

  test("is safe outside the browser", () => {
    Reflect.deleteProperty(globalThis, "document");
    expect(() => writeLanguageCookie("en")).not.toThrow();
  });
});
