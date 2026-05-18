import type { OrderPaidPayload } from "./types";

export type PrintJob = {
  printJobId: string;
  payload: OrderPaidPayload;
};

type PollJobsResponse = {
  jobs?: Array<{ printJobId?: string; payload?: OrderPaidPayload }>;
};

export async function fetchPrintJobs(
  backendBase: string,
  printAckSecret: string | undefined,
): Promise<PrintJob[]> {
  const headers: Record<string, string> = {};
  if (printAckSecret?.trim()) {
    headers["X-Print-Ack-Key"] = printAckSecret.trim();
  }

  const res = await fetch(`${backendBase}/api/print/jobs`, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`print-jobs fetch failed: ${res.status} ${text}`);
  }

  const body = (await res.json()) as PollJobsResponse;
  const jobs = body.jobs ?? [];
  const valid: PrintJob[] = [];
  for (const job of jobs) {
    if (typeof job.printJobId === "string" && job.payload) {
      valid.push({ printJobId: job.printJobId, payload: job.payload });
    }
  }
  return valid;
}

const MIN_POLL_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

export function startPrintJobPoller(params: {
  backendBase: string;
  printAckSecret: string | undefined;
  intervalMs: number;
  onJob: (job: PrintJob) => void;
  onError: (err: unknown) => void;
}): void {
  const intervalMs = Math.max(MIN_POLL_MS, params.intervalMs);
  let backoffMs = intervalMs;
  let inFlight = false;
  let stopped = false;

  const poll = async (): Promise<void> => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const jobs = await fetchPrintJobs(params.backendBase, params.printAckSecret);
      backoffMs = intervalMs;
      for (const job of jobs) {
        params.onJob(job);
      }
    } catch (err) {
      params.onError(err);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    } finally {
      inFlight = false;
      if (!stopped) {
        setTimeout(() => {
          void poll();
        }, backoffMs);
      }
    }
  };

  void poll();
}
