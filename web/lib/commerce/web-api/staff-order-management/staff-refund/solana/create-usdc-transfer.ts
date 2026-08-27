import {
  AccountRole,
  type Address,
  type GetAccountInfoApi,
  type Instruction,
  type Rpc,
  type TransactionSigner,
} from "@solana/kit";
import {
  AccountState,
  fetchMint,
  fetchToken,
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";

export class CreateUsdcTransferError extends Error {
  name = "CreateUsdcTransferError";
}

/**
 * Build a TransferChecked instruction for a USDC (or USDC-like) SPL refund,
 * appending the Solana Pay order reference as a read-only account.
 *
 * Ported from the SPL branch of @solana/pay createTransfer (MIT).
 */
export async function createUsdcTransferInstruction(params: {
  rpc: Rpc<GetAccountInfoApi>;
  sender: TransactionSigner;
  recipient: Address;
  mint: Address;
  amountBaseUnits: bigint;
  reference: Address;
}): Promise<Instruction> {
  const { rpc, sender, recipient, mint, amountBaseUnits, reference } = params;

  let mintAccount;
  try {
    mintAccount = await fetchMint(rpc, mint);
  } catch {
    throw new CreateUsdcTransferError("mint account not found");
  }
  if (!mintAccount.data.isInitialized) {
    throw new CreateUsdcTransferError("mint not initialized");
  }

  const tokenProgram: Address =
    mintAccount.programAddress === TOKEN_2022_PROGRAM_ADDRESS
      ? TOKEN_2022_PROGRAM_ADDRESS
      : mintAccount.programAddress === TOKEN_PROGRAM_ADDRESS
        ? TOKEN_PROGRAM_ADDRESS
        : (() => {
            throw new CreateUsdcTransferError("unsupported mint token program");
          })();

  const decimals = mintAccount.data.decimals;
  if (decimals < 2) {
    throw new CreateUsdcTransferError("mint decimals must be >= 2 for cent amounts");
  }

  const [[senderATA], [recipientATA]] = await Promise.all([
    findAssociatedTokenPda({ owner: sender.address, tokenProgram, mint }),
    findAssociatedTokenPda({ owner: recipient, tokenProgram, mint }),
  ]);

  const [senderAccount, recipientAccount] = await Promise.all([
    fetchToken(rpc, senderATA),
    fetchToken(rpc, recipientATA),
  ]);

  if (senderAccount.data.state === AccountState.Uninitialized) {
    throw new CreateUsdcTransferError("sender not initialized");
  }
  if (senderAccount.data.state === AccountState.Frozen) {
    throw new CreateUsdcTransferError("sender frozen");
  }
  if (recipientAccount.data.state === AccountState.Uninitialized) {
    throw new CreateUsdcTransferError("recipient not initialized");
  }
  if (recipientAccount.data.state === AccountState.Frozen) {
    throw new CreateUsdcTransferError("recipient frozen");
  }
  if (amountBaseUnits > senderAccount.data.amount) {
    throw new CreateUsdcTransferError("insufficient funds");
  }

  const transferInstruction = getTransferCheckedInstruction(
    {
      source: senderATA,
      mint,
      destination: recipientATA,
      authority: sender,
      amount: amountBaseUnits,
      decimals,
    },
    { programAddress: tokenProgram },
  );

  const existingAccounts = transferInstruction.accounts ?? [];
  return {
    ...transferInstruction,
    accounts: [
      ...existingAccounts,
      { address: reference, role: AccountRole.READONLY as const },
    ],
  };
}

/** Convert whole-cent amounts to mint base units. Requires mintDecimals >= 2. */
export function centsToBaseUnits(amountCents: number, mintDecimals: number): bigint {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new CreateUsdcTransferError(`Invalid amountCents: ${amountCents}`);
  }
  if (!Number.isInteger(mintDecimals) || mintDecimals < 2) {
    throw new CreateUsdcTransferError(`Invalid mintDecimals: ${mintDecimals}`);
  }
  return BigInt(amountCents) * BigInt(10) ** BigInt(mintDecimals - 2);
}
