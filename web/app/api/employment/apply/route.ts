import { handleEmploymentApplicationSubmit } from "@/lib/employment/adapters/http/submit-application";

export async function POST(req: Request): Promise<Response> {
  return handleEmploymentApplicationSubmit(req);
}
