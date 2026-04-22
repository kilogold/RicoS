import { generateKeyPairSigner } from "@solana/signers";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const signer = await generateKeyPairSigner();
    return NextResponse.json({ reference: signer.address });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate reference address" },
      { status: 500 },
    );
  }
}
