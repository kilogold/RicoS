import { Readable } from "node:stream";
import { google } from "googleapis";
import { requiredEnv } from "@/lib/shared/config/server-env";

const EMPLOYMENT_SHEET_NAME = "Applications";

let authCache: InstanceType<typeof google.auth.OAuth2> | null = null;

/**
 * Keep names human-readable while removing characters that break file names.
 * Examples:
 * - " José Pérez / Resume?.pdf " -> "José Pérez Resume .pdf"
 * - ".." -> "Applicant"
 */
function sanitizeFileNameSegment(value: string): string {
  // Normalize Unicode spacing/compat chars, then trim edge whitespace.
  let cleaned = value.normalize("NFKC").trim();

  // Replace characters invalid on common filesystems with spaces.
  cleaned = cleaned.replace(/[\\/:*?"<>|]/g, " ");

  // Collapse repeated spaces so names remain readable.
  cleaned = cleaned.replace(/\s+/g, " ");

  // Remove leading/trailing dots to avoid hidden or invalid edge names.
  cleaned = cleaned.replace(/^\.+|\.+$/g, "").trim();

  // Fallback prevents empty/invalid file name segments after sanitization.
  // Note: repeated fallback values can contribute to duplicate display names.
  return cleaned || "Applicant";
}

function googleAuth() {
  if (authCache) return authCache;

  const auth = new google.auth.OAuth2(
    requiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
    requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
  );
  auth.setCredentials({
    refresh_token: requiredEnv("GOOGLE_OAUTH_REFRESH_TOKEN"),
  });

  authCache = auth;
  return authCache;
}

function timestampDatePrefix(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildResumeDriveFileName(applicantName: string, originalName: string): string {
  const datePart = timestampDatePrefix();
  const namePart = sanitizeFileNameSegment(applicantName);
  const originalPart = sanitizeFileNameSegment(originalName);
  return `${datePart}_${namePart}_${originalPart}`;
}

export async function uploadResume(params: {
  file: File;
  applicantName: string;
}): Promise<{ fileId: string; webViewLink: string }> {
  const folderId = requiredEnv("GOOGLE_EMPLOYMENT_RESUMES_FOLDER_ID");
  const auth = googleAuth();
  const drive = google.drive({ version: "v3", auth });

  const payloadBuffer = Buffer.from(await params.file.arrayBuffer());
  const response = await drive.files.create({
    requestBody: {
      name: buildResumeDriveFileName(params.applicantName, params.file.name),
      mimeType: params.file.type || undefined,
      parents: [folderId],
    },
    media: {
      mimeType: params.file.type || "application/octet-stream",
      body: Readable.from(payloadBuffer),
    },
    fields: "id,webViewLink",
  });

  const fileId = response.data.id?.trim();
  if (!fileId) {
    throw new Error("Drive upload returned no file id");
  }

  return {
    fileId,
    webViewLink:
      response.data.webViewLink?.trim() || `https://drive.google.com/file/d/${fileId}/view`,
  };
}

export async function appendApplicationRow(values: string[]): Promise<void> {
  const spreadsheetId = requiredEnv("GOOGLE_EMPLOYMENT_SPREADSHEET_ID");
  const sheetName = process.env.GOOGLE_EMPLOYMENT_SHEET_NAME?.trim() || EMPLOYMENT_SHEET_NAME;
  const auth = googleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${sheetName.replaceAll("'", "''")}'!A:L`,
    valueInputOption: "RAW",
    requestBody: {
      values: [values],
    },
  });
}
