#!/usr/bin/env bun
/**
 * `bun run dev:bootstrap` cannot open extra Cursor integrated terminals from a script.
 * Use the workspace task instead (one dedicated terminal per service).
 */
const lines = [
  "",
  "RicoS dev bootstrap (split terminals)",
  "",
  "  In Cursor / VS Code:",
  '    1. Command Palette (Cmd+Shift+P / Ctrl+Shift+P)',
  '    2. "Tasks: Run Task"',
  '    3. Choose "RicoS: Dev bootstrap"',
  "",
  "  That starts webhook-proxy, kitchen-relay, and web — each in its own terminal tab.",
  "  Each process gets repo-root .env and .env.local via the root dev:… scripts (Bun loads ../.env* relative to each package cwd).",
  "",
  "  Or from any shell (three terminals):",
  "    bun run dev:webhook-proxy",
  "    bun run dev:kitchen",
  "    bun run dev:web",
  "",
];

console.log(lines.join("\n"));
