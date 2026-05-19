import type { PrintDestination } from "./print-routing";

export type DestinationPrintStatus = "pending" | "done" | "failed";

export type DestinationPrintState = {
  destination: PrintDestination;
  status: DestinationPrintStatus;
  error?: string;
};

export type LocalPrintJobState = {
  printJobId: string;
  destinations: DestinationPrintState[];
};

const registry = new Map<string, LocalPrintJobState>();

export function getOrCreatePrintJobState(
  printJobId: string,
  destinations: PrintDestination[],
): LocalPrintJobState {
  const existing = registry.get(printJobId);
  if (existing) {
    return existing;
  }
  const state: LocalPrintJobState = {
    printJobId,
    destinations: destinations.map((destination) => ({ destination, status: "pending" })),
  };
  registry.set(printJobId, state);
  return state;
}

export function getDestinationState(
  state: LocalPrintJobState,
  destination: PrintDestination,
): DestinationPrintState {
  const entry = state.destinations.find((d) => d.destination === destination);
  if (!entry) {
    throw new Error(`Print job ${state.printJobId}: unknown destination ${destination}`);
  }
  return entry;
}

export function markDestinationDone(state: LocalPrintJobState, destination: PrintDestination): void {
  getDestinationState(state, destination).status = "done";
}

export function markDestinationFailed(
  state: LocalPrintJobState,
  destination: PrintDestination,
  error: string,
): void {
  const entry = getDestinationState(state, destination);
  entry.status = "failed";
  entry.error = error;
}

export function allDestinationsDone(state: LocalPrintJobState): boolean {
  return state.destinations.every((d) => d.status === "done");
}

export function clearPrintJobState(printJobId: string): void {
  registry.delete(printJobId);
}

/** Test-only: reset process registry between cases. */
export function _clearPrintJobRegistryForTests(): void {
  registry.clear();
}
