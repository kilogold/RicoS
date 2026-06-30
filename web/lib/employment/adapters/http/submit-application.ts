import { NextResponse } from "next/server";
import { storeLocalIsoTimestamp } from "@/lib/commerce/domain/store-hours";
import type { EmploymentRole } from "@/lib/employment/domain/application-types";
import { formatAvailabilitySheetCells } from "@/lib/employment/domain/format-availability-sheet-cells";
import { validateEmploymentApplication } from "@/lib/employment/domain/validate-application";
import {
  appendApplicationRow,
  uploadResume,
} from "@/lib/employment/infrastructure/google-workspace-client";

function roleDisplay(role: EmploymentRole): string {
  return role === "kitchen" ? "Kitchen" : "Waiter";
}

export async function handleEmploymentApplicationSubmit(req: Request): Promise<Response> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { ok: false, error: "invalid_content_type" },
      { status: 415 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form_data" }, { status: 400 });
  }

  const validated = validateEmploymentApplication(formData);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: validated.error, fieldErrors: validated.fieldErrors },
      { status: 400 },
    );
  }

  const application = validated.value;
  const submittedAt = storeLocalIsoTimestamp(new Date());

  let uploadedResume: { fileId: string; webViewLink: string };
  try {
    uploadedResume = await uploadResume({
      file: application.resume,
      applicantName: application.fullName,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        scope: "employment_apply",
        stage: "drive_upload",
        detail: err instanceof Error ? err.message : String(err),
        applicantName: application.fullName,
      }),
    );
    return NextResponse.json({ ok: false, error: "resume_upload_failed" }, { status: 502 });
  }

  const rowValues = [
    submittedAt,
    application.fullName,
    application.phone,
    roleDisplay(application.role),
    ...formatAvailabilitySheetCells(application.availability),
    uploadedResume.webViewLink,
  ];

  try {
    await appendApplicationRow(rowValues);
  } catch (err) {
    console.error(
      JSON.stringify({
        scope: "employment_apply",
        stage: "sheet_append",
        detail: err instanceof Error ? err.message : String(err),
        applicantName: application.fullName,
        orphanedDriveFileId: uploadedResume.fileId,
      }),
    );
    return NextResponse.json({ ok: false, error: "sheet_append_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
