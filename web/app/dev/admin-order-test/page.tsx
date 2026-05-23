"use client";

import { approveRefund } from "@/lib/admin-passkey/client";
import type { KitchenOrderPayload } from "@/lib/commerce/domain";
import {
  orderServiceModeLabel,
  type OrderServiceMode,
} from "@/lib/commerce/order-service-mode";
import { useCallback, useEffect, useState } from "react";

const MS_PER_SECOND = 1000;
const ORDERS_POLL_INTERVAL_SECONDS = 12;
const ORDERS_POLL_INTERVAL_MS = ORDERS_POLL_INTERVAL_SECONDS * MS_PER_SECOND;

/** Major currency units (e.g. dollars) per minor unit (cents). */
const CENTS_PER_MAJOR_UNIT = 100;

const DECIMAL_RADIX = 10;

/** Arguments after (year, monthIndex, day) for `new Date` — local start of calendar day. */
const LOCAL_MIDNIGHT_HMS = [0, 0, 0, 0] as const;
/** Local end of calendar day (inclusive upper bound for timestamps in `localDayBoundsMs`). */
const LOCAL_END_OF_DAY_HMS = [23, 59, 59, 999] as const;

const ORDER_TABLE_COLUMN_COUNT = 11;

/** Minimum refund amount accepted by the staff refund API (integer cents). */
const REFUND_MIN_AMOUNT_CENTS = 1;

/** Confirmation text shown length before ellipsis (Solana signatures are long). */
const CONFIRMATION_DISPLAY_MAX_LEN = 36;

type RefundDetailRow = {
  id: number;
  amountCents: number;
  createdAt: number;
  confirmedAt: number | null;
  stripeRefundConfirmation: string | null;
  solanaRefundTransactionSignature: string | null;
};

type OrderRow = {
  orderReference: string;
  paymentProvider: "stripe" | "helius";
  grandTotalCents: number;
  currency: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  serviceMode: OrderServiceMode | null;
  /** Parsed DB `payload_json`. */
  payload: KitchenOrderPayload;
  lineCount: number;
  refunds: RefundDetailRow[];
};

type OrdersFetchResult =
  | { ok: true; orders: OrderRow[]; from: number; fetchedAt: number }
  | { ok: false; error: string; from: number };

function isRefundOrderStatus(status: string): boolean {
  return status === "refunding" || status === "refunded";
}

function isPendingOrderStatus(status: string): boolean {
  return status === "pending";
}

function formatRefundConfirmation(refund: RefundDetailRow): string {
  if (refund.stripeRefundConfirmation) return refund.stripeRefundConfirmation;
  if (refund.solanaRefundTransactionSignature) return refund.solanaRefundTransactionSignature;
  return "Pending confirmation";
}

function abbreviateForTable(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const keptCharactersPerSide = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, keptCharactersPerSide)}…${value.slice(-keptCharactersPerSide)}`;
}

function localDayBoundsMs(): { from: number; to: number } {
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    ...LOCAL_MIDNIGHT_HMS,
  );
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    ...LOCAL_END_OF_DAY_HMS,
  );
  return { from: start.getTime(), to: end.getTime() };
}

function formatMoney(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(amountCents / CENTS_PER_MAJOR_UNIT);
  } catch {
    return `${(amountCents / CENTS_PER_MAJOR_UNIT).toFixed(2)} ${currency}`;
  }
}

function formatServiceMode(serviceMode: OrderServiceMode | null | undefined): string {
  return serviceMode ? orderServiceModeLabel(serviceMode) : "Unknown";
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

async function requestOrders(): Promise<OrdersFetchResult> {
  const { from, to } = localDayBoundsMs();
  try {
    const searchParams = new URLSearchParams({
      from: String(from),
      to: String(to),
    });
    const response = await fetch(`/api/staff/admin/orders?${searchParams}`, {
      credentials: "include",
    });
    const responseBody = (await response.json()) as { orders?: OrderRow[]; error?: string };
    if (!response.ok) {
      return { ok: false, error: responseBody.error ?? `HTTP ${response.status}`, from };
    }
    return { ok: true, orders: responseBody.orders ?? [], from, fetchedAt: Date.now() };
  } catch (requestError) {
    return {
      ok: false,
      error: requestError instanceof Error ? requestError.message : String(requestError),
      from,
    };
  }
}

function OrderPayloadCartView({
  payload,
  formatMoney,
}: {
  payload: KitchenOrderPayload;
  formatMoney: (amountCents: number, currency: string) => string;
}) {
  const currencyCode = payload.currency || "USD";

  if (!payload.lines.length) {
    return (
      <p className="text-sm text-slate-400">
        No line items in <code className="text-sky-400">payload_json</code>.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <ul className="divide-y divide-slate-700/90">
        {payload.lines.map((line, lineIndex) => {
          const title = line.itemLabel.trim() || line.id;
          const detailLines =
            line.selectionLines.length > 0
              ? line.selectionLines
              : Object.entries(line.selections).flatMap(([groupId, optionIds]) =>
                  optionIds.length ? [`${groupId}: ${optionIds.join(", ")}`] : [],
                );

          return (
            <li key={`${line.id}-${lineIndex}`} className="flex gap-4 py-4 first:pt-1">
              <div className="min-w-9 shrink-0 pt-0.5 text-center">
                <span className="inline-flex min-w-7 justify-center rounded-md bg-slate-800/90 px-2 py-0.5 text-sm font-semibold tabular-nums text-sky-200">
                  {line.quantity}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-[15px] font-medium leading-snug text-slate-100">{title}</p>
                  <p className="shrink-0 text-sm font-semibold tabular-nums tracking-tight text-emerald-200/95">
                    {formatMoney(line.lineExtendedTotalCents, currencyCode)}
                  </p>
                </div>
                {line.quantity > 1 ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {formatMoney(line.lineUnitTotalCents, currencyCode)} each × {line.quantity}
                  </p>
                ) : null}
                {detailLines.length > 0 ? (
                  <ul className="mt-2 space-y-1 border-l border-emerald-900/50 pl-3 text-[13px] leading-relaxed text-slate-400">
                    {detailLines.map((detailLine, detailLineIndex) => (
                      <li key={detailLineIndex}>{detailLine}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between border-t border-slate-600 pt-4">
        <span className="text-sm font-medium uppercase tracking-wide text-slate-400">Order total</span>
        <span className="text-lg font-semibold tabular-nums text-white">
          {formatMoney(payload.grandTotalCents, currencyCode)}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-slate-700/80 bg-slate-950/40 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-slate-500">
        <p className="break-all">
          <span className="text-slate-600">Ingress</span> {payload.paymentIngressEventId}
        </p>
        <p className="mt-1.5 break-all">
          <span className="text-slate-600">Payment ref</span> {payload.paymentReferenceId}
        </p>
      </div>
    </div>
  );
}

export default function AdminOrderTestPage() {
  const [dayLabel, setDayLabel] = useState(() =>
    new Date(localDayBoundsMs().from).toDateString(),
  );
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [selectedOrderReference, setSelectedOrderReference] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [showPendingOrders, setShowPendingOrders] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [refundAmountCents, setRefundAmountCents] = useState("");
  const [refundSolanaSig, setRefundSolanaSig] = useState("");
  const [refundIdempotency, setRefundIdempotency] = useState("");
  const [refundError, setRefundError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await requestOrders();
      setDayLabel(new Date(result.from).toDateString());
      if (!result.ok) {
        setError(result.error);
        setOrders([]);
        return;
      }
      setOrders(result.orders);
      setLastFetchedAt(result.fetchedAt);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadInitialOrders() {
      const result = await requestOrders();
      if (cancelled) return;
      setDayLabel(new Date(result.from).toDateString());
      if (!result.ok) {
        setError(result.error);
        setOrders([]);
        return;
      }
      setError(null);
      setOrders(result.orders);
      setLastFetchedAt(result.fetchedAt);
    }

    void loadInitialOrders();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchOrders();
    }, ORDERS_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchOrders]);

  const visibleOrders = showPendingOrders
    ? orders
    : orders.filter((order) => !isPendingOrderStatus(order.status));
  const hiddenPendingCount = showPendingOrders
    ? 0
    : orders.filter((order) => isPendingOrderStatus(order.status)).length;

  const selectedOrder =
    visibleOrders.find((order) => order.orderReference === selectedOrderReference) ?? null;

  useEffect(() => {
    if (!selectedOrderReference) return;
    if (!visibleOrders.some((order) => order.orderReference === selectedOrderReference)) {
      setSelectedOrderReference(null);
    }
  }, [visibleOrders, selectedOrderReference]);

  async function postJson(requestPath: string, requestBody: Record<string, unknown>): Promise<void> {
    setActionBusy(true);
    setActionMessage(null);
    try {
      const response = await fetch(requestPath, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionMessage(
          typeof responseBody.error === "string" ? responseBody.error : `HTTP ${response.status}`,
        );
        return;
      }
      setActionMessage(JSON.stringify(responseBody));
      await fetchOrders();
    } catch (postError) {
      setActionMessage(postError instanceof Error ? postError.message : String(postError));
    } finally {
      setActionBusy(false);
    }
  }

  function openRefundModal(): void {
    if (!selectedOrder) return;
    setRefundAmountCents(String(selectedOrder.grandTotalCents));
    setRefundSolanaSig("");
    setRefundIdempotency("");
    setRefundError(null);
    setRefundOpen(true);
  }

  function clearRefundFieldError(): void {
    setRefundError(null);
  }

  async function submitRefund(): Promise<void> {
    if (!selectedOrder) return;
    const refundAmount = Number.parseInt(refundAmountCents.trim(), DECIMAL_RADIX);
    if (!Number.isFinite(refundAmount) || refundAmount < REFUND_MIN_AMOUNT_CENTS) {
      setRefundError("Refund amount (cents) must be a positive integer.");
      return;
    }
    const requestBody: {
      orderReference: string;
      amountCents: number;
      solanaRefundTransactionSignature?: string;
      idempotencyKey?: string;
    } = {
      orderReference: selectedOrder.orderReference,
      amountCents: refundAmount,
    };
    if (selectedOrder.paymentProvider === "helius") {
      const solanaRefundTransactionSignature = refundSolanaSig.trim();
      if (!solanaRefundTransactionSignature) {
        setRefundError("Solana refund transaction signature is required for Helius orders.");
        return;
      }
      requestBody.solanaRefundTransactionSignature = solanaRefundTransactionSignature;
    }
    const idempotencyKey = refundIdempotency.trim();
    if (idempotencyKey) requestBody.idempotencyKey = idempotencyKey;

    setActionBusy(true);
    setRefundError(null);
    try {
      const result = await approveRefund(requestBody);
      if (!result.ok) {
        setRefundError(result.message);
        return;
      }
      setRefundOpen(false);
      setActionMessage(JSON.stringify(result.body));
      await fetchOrders();
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-3 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-6 text-slate-100 sm:px-4 sm:pt-8">
      <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Admin order flow (dev)</h1>
      <p className="mt-2 max-w-2xl text-xs text-slate-400 sm:text-sm">
        Passkey-gated admin panel for manual UX testing. Refunds require a second passkey approval
        in the refund modal. Orders shown use your browser&apos;s local calendar day ({dayLabel}).
      </p>


      <div className="mt-5 flex flex-col gap-3 sm:mt-6 sm:flex-row sm:flex-wrap sm:items-end">
        <button
          type="button"
          onClick={() => void fetchOrders()}
          disabled={loading}
          className="min-h-[44px] shrink-0 rounded-lg bg-sky-600 px-4 py-2.5 text-base font-medium text-white touch-manipulation hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 sm:text-sm"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button
          type="button"
          aria-pressed={showPendingOrders}
          onClick={() => setShowPendingOrders((show) => !show)}
          className={`min-h-[44px] shrink-0 rounded-lg border px-4 py-2.5 text-base font-medium touch-manipulation sm:text-sm ${
            showPendingOrders
              ? "border-amber-600 bg-amber-900/50 text-amber-100 hover:bg-amber-800/50 active:bg-amber-950/50"
              : "border-slate-600 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 active:bg-slate-900/60"
          }`}
        >
          {showPendingOrders ? "Hide pending" : "Show pending"}
          {!showPendingOrders && hiddenPendingCount > 0
            ? ` (${hiddenPendingCount})`
            : ""}
        </button>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-rose-400" role="alert">
          {error}
        </p>
      ) : null}

      {lastFetchedAt ? (
        <p className="mt-2 text-xs text-slate-500">
          Last updated: {formatTime(lastFetchedAt)} · auto-refresh every{" "}
          {ORDERS_POLL_INTERVAL_SECONDS}s
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-2 sm:mt-6 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
        <button
          type="button"
          disabled={!selectedOrder || actionBusy}
          onClick={() =>
            selectedOrder &&
            void postJson("/api/staff/admin/fulfillment", {
              orderReference: selectedOrder.orderReference,
            })
          }
          className="min-h-[48px] rounded-lg border border-emerald-700 bg-emerald-900/40 px-4 py-3 text-base font-medium text-emerald-100 touch-manipulation hover:bg-emerald-800/50 active:bg-emerald-950/50 disabled:opacity-40 sm:py-2 sm:text-sm"
        >
          Fulfill
        </button>
        <button
          type="button"
          disabled={!selectedOrder || actionBusy}
          onClick={() =>
            selectedOrder &&
            void postJson("/api/staff/admin/print-receipt", {
              orderReference: selectedOrder.orderReference,
            })
          }
          className="min-h-[48px] rounded-lg border border-violet-700 bg-violet-900/40 px-4 py-3 text-base font-medium text-violet-100 touch-manipulation hover:bg-violet-800/50 active:bg-violet-950/50 disabled:opacity-40 sm:py-2 sm:text-sm"
        >
          Print receipt
        </button>
        <button
          type="button"
          disabled={!selectedOrder || actionBusy}
          onClick={openRefundModal}
          className="min-h-[48px] rounded-lg border border-amber-700 bg-amber-900/40 px-4 py-3 text-base font-medium text-amber-100 touch-manipulation hover:bg-amber-800/50 active:bg-amber-950/50 disabled:opacity-40 sm:py-2 sm:text-sm"
        >
          Refund…
        </button>
        <button
          type="button"
          disabled={!selectedOrder}
          onClick={() => selectedOrder && setDetailsOpen(true)}
          className="min-h-[48px] rounded-lg border border-slate-600 bg-slate-800/60 px-4 py-3 text-base font-medium text-slate-100 touch-manipulation hover:bg-slate-700/60 active:bg-slate-900/60 disabled:opacity-40 sm:py-2 sm:text-sm"
        >
          Order details…
        </button>
      </div>

      {actionMessage ? (
        <pre className="mt-3 max-h-32 overflow-auto rounded-md bg-slate-950/80 p-3 font-mono text-xs text-slate-300">
          {actionMessage}
        </pre>
      ) : null}

      {/* Mobile: stacked cards (no horizontal scroll) */}
      <div className="mt-6 space-y-3 md:hidden">
        {visibleOrders.length === 0 && !loading ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-500">
            {orders.length === 0
              ? "No orders in the selected window."
              : hiddenPendingCount > 0
                ? `No visible orders (${hiddenPendingCount} pending hidden).`
                : "No orders in the selected window."}
          </div>
        ) : null}
        {visibleOrders.map((order) => {
          const isSelected = selectedOrderReference === order.orderReference;
          const refundBlocks =
            isRefundOrderStatus(order.status) && order.refunds.length > 0
              ? order.refunds.map((refund) => {
                  const fullConfirmation = formatRefundConfirmation(refund);
                  const displayConfirmation = abbreviateForTable(
                    fullConfirmation,
                    CONFIRMATION_DISPLAY_MAX_LEN,
                  );
                  return (
                    <div
                      key={`${order.orderReference}-refund-${refund.id}`}
                      className="rounded-lg border border-amber-800/50 bg-amber-950/25 px-3 py-3 text-amber-100/90"
                    >
                      <p className="font-mono text-[11px] text-amber-200/80">Refund #{refund.id}</p>
                      <p className="mt-1 font-mono text-xs text-amber-100/90">
                        {formatMoney(refund.amountCents, order.currency)}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-slate-500">{formatTime(refund.createdAt)}</p>
                      <p className="mt-2 break-all font-mono text-[10px] leading-snug text-amber-100/80">
                        {displayConfirmation}
                      </p>
                    </div>
                  );
                })
              : null;

          return (
            <div key={order.orderReference} className="space-y-2">
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedOrderReference(order.orderReference)}
                className={`flex w-full touch-manipulation items-start gap-3 rounded-xl border px-4 py-4 text-left transition active:scale-[0.99] ${
                  isSelected
                    ? "border-sky-500 bg-sky-950/40 ring-2 ring-sky-500/40"
                    : "border-slate-700 bg-slate-900/40 hover:bg-slate-800/50"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-2xl font-semibold tabular-nums text-white">
                      {formatMoney(order.grandTotalCents, order.currency)}
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-300">
                      {order.status}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[11px] leading-snug text-slate-500">{order.orderReference}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span>{formatTime(order.createdAt)}</span>
                    <span className="text-slate-600">·</span>
                    <span>{formatServiceMode(order.serviceMode)}</span>
                    <span className="text-slate-600">·</span>
                    <span className="uppercase">{order.paymentProvider}</span>
                    <span className="text-slate-600">·</span>
                    <span>{order.lineCount} lines</span>
                  </div>
                  {order.customerName || order.customerPhone ? (
                    <p className="mt-2 truncate text-sm text-slate-300" title={order.customerName ?? order.customerPhone ?? ""}>
                      {order.customerName ?? order.customerPhone ?? "—"}
                    </p>
                  ) : null}
                </div>
              </button>
              {refundBlocks}
            </div>
          );
        })}
      </div>

      {/* Desktop: full table */}
      <div className="mt-6 hidden overflow-x-auto rounded-lg border border-slate-700 bg-slate-900/40 md:block">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="w-10 p-3" />
              <th className="p-3">Created</th>
              <th className="p-3">Reference</th>
              <th className="p-3">Provider</th>
              <th className="p-3">Mode</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Lines</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Email</th>
            </tr>
          </thead>
          <tbody>
            {visibleOrders.length === 0 && !loading ? (
              <tr>
                <td colSpan={ORDER_TABLE_COLUMN_COUNT} className="p-6 text-center text-slate-500">
                  {orders.length === 0
                    ? "No orders in the selected window."
                    : hiddenPendingCount > 0
                      ? `No visible orders (${hiddenPendingCount} pending hidden).`
                      : "No orders in the selected window."}
                </td>
              </tr>
            ) : null}
            {visibleOrders.flatMap((order) => {
              const isSelected = selectedOrderReference === order.orderReference;
              const refundExtras =
                isRefundOrderStatus(order.status) && order.refunds.length > 0
                  ? order.refunds.map((refund) => {
                      const fullConfirmation = formatRefundConfirmation(refund);
                      const displayConfirmation = abbreviateForTable(
                        fullConfirmation,
                        CONFIRMATION_DISPLAY_MAX_LEN,
                      );
                      return (
                        <tr
                          key={`${order.orderReference}-refund-${refund.id}`}
                          className="border-b border-slate-800 bg-amber-950/25 text-amber-100/90 last:border-0"
                        >
                          <td className="p-3" />
                          <td className="whitespace-nowrap p-3 font-mono text-xs">
                            <div>{formatTime(refund.createdAt)}</div>
                            {refund.confirmedAt !== null &&
                            refund.confirmedAt !== undefined &&
                            refund.confirmedAt !== refund.createdAt ? (
                              <div className="text-[11px] text-amber-200/60">
                                Confirmed {formatTime(refund.confirmedAt)}
                              </div>
                            ) : null}
                          </td>
                          <td className="max-w-[280px] p-3 font-mono text-xs text-amber-200/80">
                            <div>↳ Refund ID {refund.id}</div>
                            <div
                              className="mt-1 truncate font-mono text-[11px] text-amber-100/95"
                              title={fullConfirmation}
                            >
                              {displayConfirmation}
                            </div>
                          </td>
                          <td className="p-3 text-slate-500">—</td>
                          <td className="p-3 text-slate-500">—</td>
                          <td className="p-3">{formatMoney(refund.amountCents, order.currency)}</td>
                          <td className="p-3 text-amber-200/90">refund</td>
                          <td className="p-3 text-slate-500">—</td>
                          <td className="p-3 text-slate-500">—</td>
                          <td className="p-3 text-slate-500">—</td>
                          <td className="p-3 text-slate-500">—</td>
                        </tr>
                      );
                    })
                  : [];

              return [
                <tr
                  key={order.orderReference}
                  onClick={() => setSelectedOrderReference(order.orderReference)}
                  className={`cursor-pointer border-b border-slate-800 last:border-0 ${
                    isSelected ? "bg-sky-950/50" : "hover:bg-slate-800/40"
                  }`}
                >
                  <td className="p-3">
                    <input
                      type="radio"
                      name="orderPickDesktop"
                      checked={isSelected}
                      onChange={() => setSelectedOrderReference(order.orderReference)}
                      className="accent-sky-500"
                    />
                  </td>
                  <td className="whitespace-nowrap p-3 font-mono text-xs text-slate-300">
                    {formatTime(order.createdAt)}
                  </td>
                  <td className="max-w-[200px] truncate p-3 font-mono text-xs" title={order.orderReference}>
                    {order.orderReference}
                  </td>
                  <td className="p-3">{order.paymentProvider}</td>
                  <td className="p-3">{formatServiceMode(order.serviceMode)}</td>
                  <td className="p-3">{formatMoney(order.grandTotalCents, order.currency)}</td>
                  <td className="p-3">{order.status}</td>
                  <td className="p-3">{order.lineCount}</td>
                  <td className="max-w-[140px] truncate p-3 text-slate-300" title={order.customerName ?? ""}>
                    {order.customerName ?? "—"}
                  </td>
                  <td className="max-w-[120px] truncate p-3 font-mono text-xs text-slate-300" title={order.customerPhone ?? ""}>
                    {order.customerPhone ?? "—"}
                  </td>
                  <td className="max-w-[160px] truncate p-3 text-slate-400" title={order.customerEmail ?? ""}>
                    {order.customerEmail ?? "—"}
                  </td>
                </tr>,
                ...refundExtras,
              ];
            })}
          </tbody>
        </table>
      </div>

      {detailsOpen && selectedOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-details-modal-title"
          onClick={(clickEvent) => {
            if (clickEvent.target === clickEvent.currentTarget) setDetailsOpen(false);
          }}
        >
          <div className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl border border-slate-600 border-b-0 bg-[#0d2137] shadow-xl sm:max-h-[85vh] sm:rounded-lg sm:border-b">
            <div className="flex shrink-0 justify-center pt-3 pb-1 sm:hidden">
              <span className="h-1 w-10 rounded-full bg-slate-600" aria-hidden />
            </div>
            <div className="border-b border-slate-600 px-4 py-4 sm:px-6">
              <h2 id="order-details-modal-title" className="text-lg font-semibold">
                Cart from <code className="text-sm text-sky-300">payload_json</code>
              </h2>
              <p className="mt-1 break-all font-mono text-xs text-slate-400">{selectedOrder.orderReference}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
              <div className="mb-5 rounded-lg border border-slate-600/80 bg-slate-950/30 px-4 py-3 text-sm text-slate-300">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Order type</p>
                <p className="mt-1.5">{formatServiceMode(selectedOrder.serviceMode)}</p>
              </div>
              {selectedOrder.customerName || selectedOrder.customerPhone || selectedOrder.customerEmail ? (
                <div className="mb-5 rounded-lg border border-slate-600/80 bg-slate-950/30 px-4 py-3 text-sm text-slate-300">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pickup contact</p>
                  {selectedOrder.customerName ? <p className="mt-1.5">{selectedOrder.customerName}</p> : null}
                  {selectedOrder.customerPhone ? (
                    <p className="font-mono text-xs text-slate-400">{selectedOrder.customerPhone}</p>
                  ) : null}
                  {selectedOrder.customerEmail ? (
                    <p className="text-xs text-slate-500">{selectedOrder.customerEmail}</p>
                  ) : null}
                </div>
              ) : null}
              <OrderPayloadCartView payload={selectedOrder.payload} formatMoney={formatMoney} />
              <details className="mt-6 rounded-lg border border-slate-700/90 bg-slate-950/35">
                <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-400">
                  Raw JSON
                </summary>
                <pre className="max-h-48 overflow-auto border-t border-slate-700/90 p-3 font-mono text-[11px] leading-relaxed text-slate-400">
                  {JSON.stringify(selectedOrder.payload, null, 2)}
                </pre>
              </details>
            </div>
            <div className="flex justify-end border-t border-slate-600 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:px-6">
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="min-h-[44px] min-w-[88px] rounded-lg bg-slate-700 px-5 py-2.5 text-base font-medium text-white touch-manipulation hover:bg-slate-600 active:bg-slate-800 sm:text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {refundOpen && selectedOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-modal-title"
          onClick={(clickEvent) => {
            if (clickEvent.target === clickEvent.currentTarget) setRefundOpen(false);
          }}
        >
          <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl border border-slate-600 border-b-0 bg-[#0d2137] p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-xl sm:max-h-none sm:rounded-lg sm:border-b sm:p-6">
            <div className="flex justify-center pb-2 sm:hidden">
              <span className="h-1 w-10 rounded-full bg-slate-600" aria-hidden />
            </div>
            <h2 id="refund-modal-title" className="text-lg font-semibold">
              Refund order
            </h2>
            <p className="mt-1 break-all font-mono text-xs text-slate-400">{selectedOrder.orderReference}</p>

            {refundError ? (
              <p
                className="mt-4 rounded-lg border border-rose-800/80 bg-rose-950/50 px-3 py-2.5 text-sm text-rose-200"
                role="alert"
              >
                {refundError}
              </p>
            ) : null}

            {actionBusy ? (
              <p className="mt-3 text-xs text-amber-200/90">Approve with passkey…</p>
            ) : null}

            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="text-slate-400">Amount (cents)</span>
              <input
                type="number"
                inputMode="numeric"
                min={REFUND_MIN_AMOUNT_CENTS}
                value={refundAmountCents}
                onChange={(changeEvent) => {
                  setRefundAmountCents(changeEvent.target.value);
                  clearRefundFieldError();
                }}
                className="min-h-[44px] rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2.5 font-mono text-base outline-none focus:border-sky-500 sm:text-sm"
              />
            </label>

            {selectedOrder.paymentProvider === "helius" ? (
              <label className="mt-3 flex flex-col gap-1 text-sm">
                <span className="text-slate-400">Solana refund tx signature</span>
                <input
                  type="text"
                  value={refundSolanaSig}
                  onChange={(changeEvent) => {
                    setRefundSolanaSig(changeEvent.target.value);
                    clearRefundFieldError();
                  }}
                  className="min-h-[44px] rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2.5 font-mono text-base outline-none focus:border-sky-500 sm:text-xs"
                  placeholder="Required for Helius"
                />
              </label>
            ) : (
              <label className="mt-3 flex flex-col gap-1 text-sm">
                <span className="text-slate-400">Stripe idempotency key (optional)</span>
                <input
                  type="text"
                  value={refundIdempotency}
                  onChange={(changeEvent) => {
                    setRefundIdempotency(changeEvent.target.value);
                    clearRefundFieldError();
                  }}
                  className="min-h-[44px] rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2.5 font-mono text-base outline-none focus:border-sky-500 sm:text-xs"
                />
              </label>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setRefundOpen(false)}
                className="min-h-[48px] rounded-lg px-4 py-3 text-base text-slate-300 touch-manipulation hover:bg-slate-800 sm:min-h-0 sm:py-2 sm:text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void submitRefund()}
                className="min-h-[48px] rounded-lg bg-amber-700 px-4 py-3 text-base font-medium text-white touch-manipulation hover:bg-amber-600 active:bg-amber-800 disabled:opacity-50 sm:min-h-0 sm:py-2 sm:text-sm"
              >
                {actionBusy ? "Approving…" : "Submit refund"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
