/**
 * Solana poller runtime primitives.
 *
 * Runtime responsibility:
 * - Keep one in-process poller state singleton on `globalThis`.
 * - Expose wake/sleep synchronization primitives for idle polling.
 * - Provide timing configuration and generic sleep utility for loop pacing.
 *
 * Separation of concerns:
 * - This file does not contain payment validation or order business logic.
 * - Business processing lives in `poller.ts`, which consumes these primitives.
 */
import { parsePositiveInt } from "@/lib/infrastructure/helius/solana-rpc";

type WakeSignalPromise = Promise<void>;
type WakeSignalResolver = () => void;
type WakeSignal = {
  promise: WakeSignalPromise;
  resolve: WakeSignalResolver;
};

type PollerState = {
  started: boolean;
  loopPromise: Promise<void> | null;
  wakePromise: WakeSignalPromise | null;
  wakeResolver: WakeSignalResolver | null;
};

const state = globalThis as typeof globalThis & { __ricosSolanaPoller?: PollerState };
if (!state.__ricosSolanaPoller) {
  state.__ricosSolanaPoller = {
    started: false,
    loopPromise: null,
    wakePromise: null,
    wakeResolver: null,
  };
}

export const pollerState = state.__ricosSolanaPoller;
export const POLL_INTERVAL_MS = parsePositiveInt(process.env.SOLANA_POLL_INTERVAL_MS, 2000);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wake/sleep model:
// - When no active pending rows exist, the poller "parks" by awaiting a Promise.
// - That Promise acts like a one-shot wake bell for the current sleep cycle.
// - A new order reference insertion calls wakeSolanaPaymentPoller(), which resolves the bell.
// - After wake, we clear the stored bell so the next sleep gets a fresh one.
function clearWakeSignal(): void {
  // Forget the current sleep bell; poller is no longer parked.
  pollerState.wakePromise = null;
  pollerState.wakeResolver = null;
}

function createWakeSignal(): WakeSignal {
  // Create a Promise and keep its resolver so another code path can wake the poller.
  let resolveSignal!: WakeSignalResolver;
  const promise: WakeSignalPromise = new Promise<void>((resolve) => {
    resolveSignal = resolve;
  });
  return { promise, resolve: resolveSignal };
}

function getOrCreateWakeSignal(): WakeSignalPromise {
  // Reuse the existing sleep bell if the poller is already parked.
  if (pollerState.wakePromise) return pollerState.wakePromise;

  // Otherwise create one bell for this sleep cycle.
  const wakeSignal = createWakeSignal();
  pollerState.wakePromise = wakeSignal.promise;
  pollerState.wakeResolver = () => {
    // Clear state first, then release the waiting loop.
    clearWakeSignal();
    wakeSignal.resolve();
  };
  return wakeSignal.promise;
}

export function waitForWakeSignal(): WakeSignalPromise {
  // Called by the loop when it decides to sleep.
  return getOrCreateWakeSignal();
}

export function wakeSolanaPaymentPoller(): void {
  // No-op if the poller is already awake.
  pollerState.wakeResolver?.();
}
