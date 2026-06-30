import { Readable } from "node:stream";
import { google } from "googleapis";
import { requiredEnv } from "@/lib/shared/config/server-env";

const EMPLOYMENT_SHEET_NAME = "Applications";

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

let authCache: InstanceType<typeof google.auth.GoogleAuth> | null = null;

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

function parseServiceAccountCredentials(): ServiceAccountCredentials {
  const raw = requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must be a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  const clientEmail = typeof record.client_email === "string" ? record.client_email.trim() : "";
  const privateKeyRaw = typeof record.private_key === "string" ? record.private_key.trim() : "";
  if (!clientEmail) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email");
  if (!privateKeyRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing private_key");
  return {
    client_email: clientEmail,
    private_key: privateKeyRaw.replace(/\\n/g, "\n"),
  };
}

function googleAuth() {
  if (authCache) return authCache;
  const credentials = parseServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    scopes: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
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
  const auth = googleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${EMPLOYMENT_SHEET_NAME}!A:L`,
    valueInputOption: "RAW",
    requestBody: {
      values: [values],
    },
  });
}
