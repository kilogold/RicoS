import { getBase58Encoder } from "@solana/codecs-strings";
import { address, type Address } from "@solana/kit";
import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/signers";
import {
  getHeliusIngressConfig,
  getMerchantPrivateKey,
} from "@/lib/commerce/web-api/solana-payment/config";

let cachedSigner: KeyPairSigner | null = null;
let cachedRecipient: Address | null = null;

export async function getMerchantRefundSigner(): Promise<
  | { ok: true; signer: KeyPairSigner; recipient: Address }
  | { ok: false; code: "server_misconfigured"; detail?: string }
> {
  try {
    const { expectedRecipient } = getHeliusIngressConfig();
    const recipient = address(expectedRecipient);
    if (cachedSigner && cachedRecipient && String(cachedRecipient) === String(recipient)) {
      return { ok: true, signer: cachedSigner, recipient };
    }

    const secret = getMerchantPrivateKey();
    const bytes = getBase58Encoder().encode(secret);
    if (bytes.length !== 64) {
      return {
        ok: false,
        code: "server_misconfigured",
        detail: "HELIUS_MERCHANT_PRIVATE_KEY must decode to 64 bytes",
      };
    }

    const signer = await createKeyPairSignerFromBytes(bytes);
    if (signer.address !== recipient) {
      return {
        ok: false,
        code: "server_misconfigured",
        detail: "HELIUS_MERCHANT_PRIVATE_KEY does not match HELIUS_MERCHANT_RECIPIENT",
      };
    }

    cachedSigner = signer;
    cachedRecipient = recipient;
    return { ok: true, signer, recipient };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "server_misconfigured", detail: message };
  }
}
