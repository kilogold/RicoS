import { handleAthMovilReferenceRegistrationRequest } from "@/lib/commerce/web-api/ath-movil/adapters/http";

export async function POST(req: Request): Promise<Response> {
  return handleAthMovilReferenceRegistrationRequest(req);
}
