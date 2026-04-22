/**
 * Cart metadata codec v1.
 *
 * Wire format (bytes; uvarint = unsigned base-128 varint):
 *   1 byte:    codec version   = 0x01
 *   uvarint:   menuVersion
 *   uvarint:   lineCount
 *   per line:
 *     uvarint: itemIndex into the menu version's flattened item table
 *     uvarint: quantity
 *     for each group declared on the item (positional, menu order):
 *       ceil(group.options.length / 8) bytes:
 *         selection bitmask, bit N of byte floor(N/8) = option index N is selected
 *
 * Identifiers, prices, and derived totals never travel on the wire. They are
 * reconstructed at decode time from the pinned menu version's decode index.
 *
 * Integrity is verified externally: the webhook consumer compares the sum of
 * recomputed line totals to the Stripe PaymentIntent amount.
 */

/** Wire identifier written to metadata so decoders can select schema behavior. */
export const CART_CODEC_ID_V1 = "rcs-cart-v1";
/** Metadata key storing the codec identifier. */
export const CART_CODEC_KEY = "cart_codec";
/** Metadata key storing the base64url-encoded binary cart payload. */
export const CART_B64_KEY = "cart_b64";

/** Single-byte codec version written as the first byte of the binary payload. */
const CODEC_VERSION_BYTE = 0x01;

/** Max allowed metadata string length for `cart_b64` (Stripe metadata value cap). */
export const MAX_CART_B64_LENGTH = 500;
/** Derived raw-byte cap consistent with `MAX_CART_B64_LENGTH` base64url output. */
export const MAX_CART_BINARY_BYTES = 375;
/** Safety bound for encoded number of cart lines. */
const MAX_LINES = 64;
/** Safety bound for per-line quantity. */
const MAX_QUANTITY = 99;

/** Option entry in the decode index (pinned per menu version). */
export type DecodeIndexOption = { id: string; surchargeCents: number };

/** Modifier group entry in the decode index. */
export type DecodeIndexGroup = {
  id: string;
  selectionType: "single" | "multiple";
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: DecodeIndexOption[];
};

/** Menu item entry in the decode index. */
export type DecodeIndexItem = {
  id: string;
  priceCents: number;
  groups: DecodeIndexGroup[];
};

/**
 * Flattened, positional snapshot of a menu version used by the codec.
 * The array order of `items`, each item's `groups`, and each group's `options`
 * is load-bearing: indices on the wire refer to these positions.
 */
export type DecodeIndex = {
  version: number;
  items: DecodeIndexItem[];
};

/** Lookup callback used by the decoder to resolve a pinned menu version. */
export type DecodeIndexLookup = (menuVersion: number) => DecodeIndex | undefined;

/** Raw cart input accepted by the encoder. */
export type CartLineInput = {
  itemId: string;
  quantity: number;
  selections: Record<string, string[]>;
};

/** One resolved modifier option with its checkout-time surcharge. */
export type PricedModifierSelection = {
  groupId: string;
  optionId: string;
  optionSurchargeCents: number;
};

/** Hydrated cart line produced by the decoder (and the encoder, internally). */
export type HydratedCartLine = {
  id: string;
  quantity: number;
  selections: Record<string, string[]>;
  unitBasePriceCents: number;
  selectedModifiers: PricedModifierSelection[];
  lineUnitTotalCents: number;
  lineExtendedTotalCents: number;
};

/** Fully reconstructed cart returned by the decoder. */
export type HydratedCart = {
  menuVersion: number;
  lines: HydratedCartLine[];
  cartTotalCents: number;
};

/**
 * Encoder output.
 * `metadata` goes on the Stripe PaymentIntent.
 * `amountCents` is the cart total; callers use it as the PaymentIntent amount
 * so there is a single source of truth for pricing math.
 */
export type EncodeCartResult = {
  metadata: Record<string, string>;
  amountCents: number;
};

/**
 * Encode a cart into Stripe metadata fields against a pinned menu version.
 * Validates structure, selection counts, and unknown ids; rejects oversized payloads.
 */
export function encodeCartToMetadataV1(
  menuVersion: number,
  lines: CartLineInput[],
  decodeIndex: DecodeIndex,
): EncodeCartResult {
  if (!Number.isInteger(menuVersion) || menuVersion < 1) {
    throw new Error("Invalid menuVersion");
  }
  if (decodeIndex.version !== menuVersion) {
    throw new Error("decodeIndex.version does not match menuVersion");
  }
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > MAX_LINES) {
    throw new Error("Invalid number of cart lines");
  }

  const writer = new ByteWriter();
  writer.writeByte(CODEC_VERSION_BYTE);
  writer.writeUvarint(menuVersion);
  writer.writeUvarint(lines.length);

  let amountCents = 0;
  for (const line of lines) {
    const hydrated = encodeLineAgainstIndex(line, decodeIndex, writer);
    amountCents += hydrated.lineExtendedTotalCents;
  }

  const bytes = writer.toUint8Array();
  if (bytes.length > MAX_CART_BINARY_BYTES) {
    throw new Error("Cart metadata too large");
  }
  const encoded = toBase64Url(bytes);
  if (encoded.length > MAX_CART_B64_LENGTH) {
    throw new Error("Cart metadata too large");
  }
  return {
    metadata: {
      [CART_CODEC_KEY]: CART_CODEC_ID_V1,
      [CART_B64_KEY]: encoded,
    },
    amountCents,
  };
}

/**
 * Decode Stripe metadata into a fully hydrated cart.
 * Resolves the pinned menu version via `lookupDecodeIndex`; unknown versions fail loudly.
 */
export function decodeCartFromMetadataV1(
  metadata: Record<string, string | undefined>,
  lookupDecodeIndex: DecodeIndexLookup,
): HydratedCart {
  const codecId = metadata[CART_CODEC_KEY];
  if (codecId !== CART_CODEC_ID_V1) {
    throw new Error(`Unsupported cart codec: ${codecId ?? "(missing)"}`);
  }
  const encoded = metadata[CART_B64_KEY];
  if (!encoded) {
    throw new Error("Missing cart_b64 metadata");
  }
  if (encoded.length > MAX_CART_B64_LENGTH) {
    throw new Error("cart_b64 exceeds maximum length");
  }
  const bytes = fromBase64Url(encoded);
  if (bytes.length > MAX_CART_BINARY_BYTES) {
    throw new Error("Cart binary payload exceeds maximum size");
  }

  const reader = new ByteReader(bytes);
  const version = reader.readByte();
  if (version !== CODEC_VERSION_BYTE) {
    throw new Error(`Unsupported cart payload version: ${version}`);
  }

  const menuVersion = reader.readUvarint("menuVersion");
  if (!Number.isInteger(menuVersion) || menuVersion < 1) {
    throw new Error("Invalid menuVersion");
  }
  const decodeIndex = lookupDecodeIndex(menuVersion);
  if (!decodeIndex) {
    throw new Error(`Unknown menuVersion: ${menuVersion}`);
  }
  if (decodeIndex.version !== menuVersion) {
    throw new Error("decodeIndex.version does not match menuVersion");
  }

  const lineCount = reader.readUvarint("lineCount");
  if (lineCount < 1 || lineCount > MAX_LINES) {
    throw new Error("Invalid lineCount");
  }

  const hydratedLines: HydratedCartLine[] = [];
  let cartTotalCents = 0;

  for (let lineIdx = 0; lineIdx < lineCount; lineIdx += 1) {
    const itemIndex = reader.readUvarint("itemIndex");
    if (itemIndex >= decodeIndex.items.length) {
      throw new Error(`itemIndex out of bounds: ${itemIndex}`);
    }
    const item = decodeIndex.items[itemIndex];

    const quantity = reader.readUvarint("quantity");
    if (quantity < 1 || quantity > MAX_QUANTITY) {
      throw new Error(`Invalid quantity: ${quantity}`);
    }

    const selections: Record<string, string[]> = {};
    const selectedModifiers: PricedModifierSelection[] = [];
    let surchargeTotalCents = 0;

    for (const group of item.groups) {
      const maskBytes = selectionMaskByteCount(group);
      const mask = new Uint8Array(maskBytes);
      for (let byteIdx = 0; byteIdx < maskBytes; byteIdx += 1) {
        mask[byteIdx] = reader.readByte();
      }
      assertNoStraySelectionBits(group, mask, maskBytes);

      const selectedIndices: number[] = [];
      for (let bit = 0; bit < group.options.length; bit += 1) {
        if ((mask[bit >> 3] >> (bit & 7)) & 1) {
          selectedIndices.push(bit);
        }
      }
      validateSelectionCountForGroup(group, selectedIndices.length);

      const groupOptionIds: string[] = [];
      for (const optIdx of selectedIndices) {
        const option = group.options[optIdx];
        selectedModifiers.push({
          groupId: group.id,
          optionId: option.id,
          optionSurchargeCents: option.surchargeCents,
        });
        surchargeTotalCents += option.surchargeCents;
        groupOptionIds.push(option.id);
      }
      if (groupOptionIds.length > 0) {
        selections[group.id] = groupOptionIds;
      }
    }

    const lineUnitTotalCents = item.priceCents + surchargeTotalCents;
    const lineExtendedTotalCents = lineUnitTotalCents * quantity;
    hydratedLines.push({
      id: item.id,
      quantity,
      selections,
      unitBasePriceCents: item.priceCents,
      selectedModifiers,
      lineUnitTotalCents,
      lineExtendedTotalCents,
    });
    cartTotalCents += lineExtendedTotalCents;
  }

  if (!reader.isAtEnd()) {
    throw new Error("Unexpected bytes at end of payload");
  }

  return { menuVersion, lines: hydratedLines, cartTotalCents };
}

/** Number of bytes used to transport a group's selection mask on the wire. */
function selectionMaskByteCount(group: DecodeIndexGroup): number {
  return Math.max(1, Math.ceil(group.options.length / 8));
}

/** Rejects masks that set bits beyond the group's option range. */
function assertNoStraySelectionBits(
  group: DecodeIndexGroup,
  mask: Uint8Array,
  maskBytes: number,
): void {
  const totalBits = maskBytes * 8;
  for (let bit = group.options.length; bit < totalBits; bit += 1) {
    if ((mask[bit >> 3] >> (bit & 7)) & 1) {
      throw new Error(`Invalid selection mask for group ${group.id}`);
    }
  }
}

/** Enforces selection-count invariants (required, min/max, single-vs-multi). */
function validateSelectionCountForGroup(
  group: DecodeIndexGroup,
  count: number,
): void {
  if (group.selectionType === "single" && count > 1) {
    throw new Error(`Group ${group.id} allows only one selection`);
  }
  if (group.required && count === 0) {
    throw new Error(`Group ${group.id} is required`);
  }
  if (count < group.minSelections) {
    throw new Error(
      `Group ${group.id} requires at least ${group.minSelections} selection(s)`,
    );
  }
  if (count > group.maxSelections) {
    throw new Error(
      `Group ${group.id} allows at most ${group.maxSelections} selection(s)`,
    );
  }
}

/** Validates a single input line, writes it to the byte stream, and returns a hydrated copy. */
function encodeLineAgainstIndex(
  line: CartLineInput,
  decodeIndex: DecodeIndex,
  writer: ByteWriter,
): HydratedCartLine {
  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    throw new Error("Invalid quantity");
  }
  if (line.quantity > MAX_QUANTITY) {
    throw new Error("Invalid quantity");
  }

  const itemIndex = decodeIndex.items.findIndex((it) => it.id === line.itemId);
  if (itemIndex < 0) {
    throw new Error(`Unknown item: ${line.itemId}`);
  }
  const item = decodeIndex.items[itemIndex];

  const declaredGroupIds = new Set(item.groups.map((g) => g.id));
  const inputSelections = line.selections ?? {};
  for (const groupId of Object.keys(inputSelections)) {
    if (!declaredGroupIds.has(groupId)) {
      throw new Error(`Unknown modifier group ${groupId} on item ${line.itemId}`);
    }
  }

  writer.writeUvarint(itemIndex);
  writer.writeUvarint(line.quantity);

  const selectedModifiers: PricedModifierSelection[] = [];
  const normalizedSelections: Record<string, string[]> = {};
  let surchargeTotalCents = 0;

  for (const group of item.groups) {
    const optionIdToIndex = new Map(group.options.map((opt, i) => [opt.id, i]));
    const uniqueOptionIds = [...new Set(inputSelections[group.id] ?? [])];
    const selectedIndices: number[] = [];
    const maskBytes = selectionMaskByteCount(group);
    const mask = new Uint8Array(maskBytes);

    for (const optionId of uniqueOptionIds) {
      const idx = optionIdToIndex.get(optionId);
      if (idx === undefined) {
        throw new Error(`Unknown option ${optionId} in group ${group.id}`);
      }
      if ((mask[idx >> 3] >> (idx & 7)) & 1) {
        continue;
      }
      mask[idx >> 3] |= 1 << (idx & 7);
      selectedIndices.push(idx);
    }
    validateSelectionCountForGroup(group, selectedIndices.length);

    for (let byteIdx = 0; byteIdx < maskBytes; byteIdx += 1) {
      writer.writeByte(mask[byteIdx]);
    }

    selectedIndices.sort((a, b) => a - b);
    const groupOptionIds: string[] = [];
    for (const idx of selectedIndices) {
      const option = group.options[idx];
      selectedModifiers.push({
        groupId: group.id,
        optionId: option.id,
        optionSurchargeCents: option.surchargeCents,
      });
      surchargeTotalCents += option.surchargeCents;
      groupOptionIds.push(option.id);
    }
    if (groupOptionIds.length > 0) {
      normalizedSelections[group.id] = groupOptionIds;
    }
  }

  const lineUnitTotalCents = item.priceCents + surchargeTotalCents;
  const lineExtendedTotalCents = lineUnitTotalCents * line.quantity;

  return {
    id: item.id,
    quantity: line.quantity,
    selections: normalizedSelections,
    unitBasePriceCents: item.priceCents,
    selectedModifiers,
    lineUnitTotalCents,
    lineExtendedTotalCents,
  };
}

/**
 * Small byte accumulator used by the encoder.
 * Keeps low-level write logic isolated from business validation code.
 */
class ByteWriter {
  private readonly bytes: number[] = [];

  writeByte(value: number): void {
    this.bytes.push(value & 0xff);
  }

  writeUvarint(value: number): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error("Invalid uvarint");
    }
    let remaining = value;
    while (remaining >= 0x80) {
      this.bytes.push((remaining & 0x7f) | 0x80);
      remaining = Math.floor(remaining / 128);
    }
    this.bytes.push(remaining);
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

/**
 * Sequential byte reader used by the decoder.
 * Centralizes bounds checks and decoding primitives.
 */
class ByteReader {
  private pos = 0;

  constructor(private readonly bytes: Uint8Array) {}

  isAtEnd(): boolean {
    return this.pos === this.bytes.length;
  }

  readByte(): number {
    if (this.pos >= this.bytes.length) {
      throw new Error("Unexpected end of payload");
    }
    return this.bytes[this.pos++];
  }

  readUvarint(field: string): number {
    let shift = 0;
    let value = 0;
    while (shift < 35) {
      const byte = this.readByte();
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        return value;
      }
      shift += 7;
    }
    throw new Error(`Invalid uvarint for ${field}`);
  }
}

/** Converts raw bytes to URL-safe base64 for string-only metadata transport. */
function toBase64Url(bytes: Uint8Array): string {
  const standardBase64 = toBase64(bytes);
  return standardBase64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Converts URL-safe base64 metadata string back to raw bytes. */
function fromBase64Url(value: string): Uint8Array {
  const standardBase64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = standardBase64 + "===".slice((standardBase64.length + 3) % 4);
  return fromBase64(paddedBase64);
}

/** Platform-safe base64 encoder (Node + browser fallback). */
function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binaryString = "";
  for (const byteValue of bytes) binaryString += String.fromCharCode(byteValue);
  return btoa(binaryString);
}

/** Platform-safe base64 decoder (Node + browser fallback). */
function fromBase64(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binaryString = atob(value);
  const outputBytes = new Uint8Array(binaryString.length);
  for (let byteIndex = 0; byteIndex < binaryString.length; byteIndex += 1) {
    outputBytes[byteIndex] = binaryString.charCodeAt(byteIndex);
  }
  return outputBytes;
}
