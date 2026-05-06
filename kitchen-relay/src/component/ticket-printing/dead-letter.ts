export async function appendDeadLetter(
  path: string,
  text: string,
  meta: { eventId: string; message: string },
): Promise<void> {
  const fs = await import("node:fs/promises");
  const block = [
    `--- dead-letter ${new Date().toISOString()} event=${meta.eventId} ---`,
    meta.message,
    text,
    "",
  ].join("\n");
  await fs.appendFile(path, block + "\n", "utf8");
}
