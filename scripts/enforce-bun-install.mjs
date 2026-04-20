/**
 * Block installs driven by npm / yarn / pnpm so the monorepo stays Bun-only.
 * Invoked from root package.json "preinstall" via: bun scripts/enforce-bun-install.mjs
 */
const ua = process.env.npm_config_user_agent ?? "";
const execPath = process.env.npm_execpath ?? "";

const blocked =
  /^npm\//.test(ua) ||
  /^yarn\//.test(ua) ||
  /^pnpm\//.test(ua) ||
  /[/\\]npm-cli\.js$/.test(execPath) ||
  /[/\\]yarn\.js$/.test(execPath) ||
  /[/\\]pnpm\.cjs$/.test(execPath);

if (blocked) {
  console.error(
    "This monorepo is Bun-only. Use:\n  bun install\nDo not commit package-lock.json, yarn.lock, or pnpm-lock.yaml.",
  );
  process.exit(1);
}
