import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { runPrintJobFetchOnce } from "./poll-jobs";
import type { PrintJobHandlerInput } from "./types";

const WAIT_TIME_SECONDS = 20;

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
  const client = new SQSClient({ region: params.region });

  const loop = async (): Promise<void> => {
    for (;;) {
      try {
        const result = await client.send(
          new ReceiveMessageCommand({
            QueueUrl: params.queueUrl,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: WAIT_TIME_SECONDS,
          }),
        );

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
      }
    }
  };

  void loop();
}
