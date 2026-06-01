#!/usr/bin/env bun

/**
 * CI guard: when menu.json changes on push, catalogVersion must bump by exactly +1
 * and publishedAt must be strictly later than the previous revision.
 *
 * Env:
 *   MENU_CATALOG_BASE_REF — parent commit before the push (e.g. github.event.before)
 *   MENU_CATALOG_HEAD_REF — tip to validate (default: HEAD)
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseMenuCatalogFile } from "@ricos/shared";

const MENU_PATH = "packages/shared/src/menu.json";
const ZERO_SHA = "0".repeat(40);

function runGit(command) {
  return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function menuChanged(baseRef, headRef) {
  try {
    const names = runGit(`git diff --name-only ${baseRef} ${headRef} -- ${MENU_PATH}`);
    return names.length > 0;
  } catch {
    return true;
  }
}

function readMenuAtRef(ref) {
  try {
    const raw = runGit(`git show ${ref}:${MENU_PATH}`);
    return parseMenuCatalogFile(JSON.parse(raw));
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(`Menu catalog version check failed: ${message}`);
  process.exit(1);
}

const baseRef = process.env.MENU_CATALOG_BASE_REF?.trim();
const headRef = process.env.MENU_CATALOG_HEAD_REF?.trim() || "HEAD";

if (!baseRef || baseRef === ZERO_SHA) {
  console.log("No usable base ref; skipping menu catalog version check.");
  process.exit(0);
}

if (!menuChanged(baseRef, headRef)) {
  console.log(`${MENU_PATH} unchanged; skipping menu catalog version check.`);
  process.exit(0);
}

let headParsed;
try {
  headParsed = parseMenuCatalogFile(JSON.parse(readFileSync(MENU_PATH, "utf8")));
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

const baseParsed = readMenuAtRef(baseRef);
if (!baseParsed) {
  if (headParsed.catalogVersion !== 1) {
    fail(`initial ${MENU_PATH} must have catalogVersion 1 (got ${headParsed.catalogVersion})`);
  }
  console.log(`Menu catalog version OK: initial catalogVersion 1`);
  process.exit(0);
}

const expectedVersion = baseParsed.catalogVersion + 1;
if (headParsed.catalogVersion !== expectedVersion) {
  fail(
    `catalogVersion must be exactly ${expectedVersion} (previous ${baseParsed.catalogVersion}, got ${headParsed.catalogVersion}). ` +
      "Use the staff menu editor or bump by +1 when editing menu.json manually.",
  );
}

const headPublishedMs = Date.parse(headParsed.publishedAtIso);
const basePublishedMs = Date.parse(baseParsed.publishedAtIso);
if (!Number.isFinite(headPublishedMs) || headPublishedMs <= basePublishedMs) {
  fail(
    `publishedAt must be strictly after ${baseParsed.publishedAtIso} (got ${headParsed.publishedAtIso})`,
  );
}

console.log(
  `Menu catalog version OK: v${baseParsed.catalogVersion} -> v${headParsed.catalogVersion} at ${headParsed.publishedAtIso}`,
);
