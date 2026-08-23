/**
 * PrintBell SQS consumer timers
 *
 * Three clocks bound SQS I/O so a silently dropped long-poll cannot hang forever:
 *
 * - WAIT_TIME_SECONDS / WAIT_TIME_MS — SQS server long-poll hold. How long AWS keeps
 *   ReceiveMessage open looking for a message before returning empty.
 * 
 * - SQS_CONNECTION_TIMEOUT_MS — client connect budget only (DNS/TCP/TLS). Does not
 *   cover waiting for a response after the socket is up.
 * 
 * - SQS_REQUEST_TIMEOUT_MS — client abort for the whole HTTP call
 *   (WAIT_TIME_MS + SQS_REQUEST_TIMEOUT_SLACK_MS). Must exceed the long-poll window
 *   so normal empty polls succeed; slack covers network overhead after wait ends.
 *
 * On ReceiveMessage/DeleteMessage failure, BACKOFF_INITIAL_MS … BACKOFF_MAX_MS
 * delay the next loop iteration (exponential, reset after a successful receive).
 */
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { sleep } from "@ricos/shared";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { runPrintJobFetchOnce } from "./poll-jobs";
import type { PrintJobHandlerInput } from "./types";

const MS_PER_SECOND = 1_000;
const WAIT_TIME_SECONDS = 20;
export const SQS_REQUEST_TIMEOUT_SLACK_MS = 10_000;
export const SQS_CONNECTION_TIMEOUT_MS = 5_000;
export const WAIT_TIME_MS = WAIT_TIME_SECONDS * MS_PER_SECOND;
export const SQS_REQUEST_TIMEOUT_MS = WAIT_TIME_MS + SQS_REQUEST_TIMEOUT_SLACK_MS;

export const BACKOFF_INITIAL_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;

export function nextBackoffMs(currentMs: number): number {
  return Math.min(Math.max(currentMs, BACKOFF_INITIAL_MS) * 2, BACKOFF_MAX_MS);
}

export function createPrintBellSqsClient(region: string): SQSClient {
  return new SQSClient({
    region,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: SQS_CONNECTION_TIMEOUT_MS,
      requestTimeout: SQS_REQUEST_TIMEOUT_MS,
    }),
  });
}

/** One SQS message after ReceiveMessage: fetch/print jobs, then delete only if fetch cycle succeeded. */
export async function runPrintBellWakeCycle(params: {
  runFetchOnce: () => Promise<void>;
  deleteMessage: () => Promise<void>;
  onFetchError: (err: unknown) => void;
}): Promise<void> {
  let cycleOk = false;
  try {
    await params.runFetchOnce();
    cycleOk = true;
  } catch (err) {
    params.onFetchError(err);
  }
  if (cycleOk) {
    await params.deleteMessage();
  }
}

export function startPrintBellConsumer(params: {
  queueUrl: string;
  region: string;
  backendBase: string;
  printAckSecret: string | undefined;
  handlePrintJob: (job: PrintJobHandlerInput) => Promise<void>;
  onError: (err: unknown) => void;
}): void {
  const client = createPrintBellSqsClient(params.region);

  const loop = async (): Promise<void> => {
    let backoffMs = BACKOFF_INITIAL_MS;
    for (;;) {
      try {
        const result = await client.send(
          new ReceiveMessageCommand({
            QueueUrl: params.queueUrl,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: WAIT_TIME_SECONDS,
          }),
        );
        backoffMs = BACKOFF_INITIAL_MS;

        const msg = result.Messages?.[0];
        if (!msg?.ReceiptHandle) {
          continue;
        }

        const receipt = msg.ReceiptHandle;
        await runPrintBellWakeCycle({
          runFetchOnce: () =>
            runPrintJobFetchOnce(
              params.backendBase,
              params.printAckSecret,
              params.handlePrintJob,
            ),
          deleteMessage: async () => {
            await client.send(
              new DeleteMessageCommand({
                QueueUrl: params.queueUrl,
                ReceiptHandle: receipt,
              }),
            );
          },
          onFetchError: params.onError,
        });
      } catch (err) {
        params.onError(err);
        await sleep(backoffMs);
        backoffMs = nextBackoffMs(backoffMs);
      }
    }
  };

  void loop();
}
