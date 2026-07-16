import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET() {
  const filePath = join(process.cwd(), "legacy", "menu.html");
  const html = await readFile(filePath, "utf8");

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
