import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

function getQueueUrl(): string | undefined {
  return process.env.PRINT_BELL_QUEUE_URL?.trim() || undefined;
}

function getRegion(): string | undefined {
  const fromEnv = process.env.AWS_REGION?.trim();
  if (fromEnv) return fromEnv;
  const url = getQueueUrl();
  if (!url) return undefined;
  const match = url.match(/sqs\.([a-z0-9-]+)\.amazonaws\.com/i);
  return match?.[1];
}

/**
 * Wakeup for kitchen-relay (SQS long-poll consumer). Callers should await before
 * returning on serverless (e.g. Vercel) so SendMessage completes.
 * No-op when PRINT_BELL_QUEUE_URL is unset.
 * Uses default AWS credential chain when credentials are configured (e.g. Vercel env).
 */
export async function notifyPrintBell(printJobId: string): Promise<void> {
  const queueUrl = getQueueUrl();
  if (!queueUrl) {
    return;
  }

  const region = getRegion();
  if (!region) {
    console.error(
      "PrintBell notify skipped: set AWS_REGION (or use a queue URL under sqs.<region>.amazonaws.com)",
    );
    return;
  }

  const client = new SQSClient({ region });
  try {
    await client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ v: 1, printJobId }),
      }),
    );
  } finally {
    client.destroy();
  }
}
