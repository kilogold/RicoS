import {
  appendTransactionMessageInstructions,
  assertIsSendableTransaction,
  assertIsTransactionWithBlockhashLifetime,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { solanaRpcUrl } from "@/lib/infrastructure/helius/solana-rpc";

function rpcWebSocketUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) return `wss://${httpUrl.slice("https://".length)}`;
  if (httpUrl.startsWith("http://")) return `ws://${httpUrl.slice("http://".length)}`;
  return httpUrl;
}

let cachedSend:
  | ReturnType<typeof sendAndConfirmTransactionFactory>
  | null = null;
let cachedRpcUrl: string | null = null;

function getSendAndConfirm() {
  const url = solanaRpcUrl();
  if (!cachedSend || cachedRpcUrl !== url) {
    const rpc = createSolanaRpc(url);
    const rpcSubscriptions = createSolanaRpcSubscriptions(rpcWebSocketUrl(url));
    cachedSend = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
    cachedRpcUrl = url;
  }
  return { sendAndConfirm: cachedSend, rpc: createSolanaRpc(url) };
}

export function getSolanaKitRpc() {
  return getSendAndConfirm().rpc;
}

export async function sendSignedInstructions(params: {
  feePayer: TransactionSigner;
  instructions: Instruction[];
}): Promise<string> {
  const { sendAndConfirm, rpc } = getSendAndConfirm();
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (message) => setTransactionMessageFeePayerSigner(params.feePayer, message),
    (message) =>
      setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message),
    (message) => appendTransactionMessageInstructions(params.instructions, message),
  );

  const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
  assertIsTransactionWithBlockhashLifetime(signedTransaction);
  assertIsSendableTransaction(signedTransaction);

  await sendAndConfirm(signedTransaction, { commitment: "confirmed" });
  return getSignatureFromTransaction(signedTransaction);
}
