"use client";

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

const ORDER_TABLE_COLUMN_COUNT = 8;

/** Minimum refund amount accepted by the staff refund API (integer cents). */
const REFUND_MIN_AMOUNT_CENTS = 1;

type OrderRow = {
  orderReference: string;
  paymentProvider: "stripe" | "helius";
  amountCents: number;
  currency: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  lineCount: number;
  summaryLabel: string;
};

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

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(cents / CENTS_PER_MAJOR_UNIT);
  } catch {
    return `${(cents / CENTS_PER_MAJOR_UNIT).toFixed(2)} ${currency}`;
  }
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

const TOKEN_KEY = "dev-admin-order-test-bearer";

export default function AdminOrderTestPage() {
  const [dayLabel, setDayLabel] = useState(() =>
    new Date(localDayBoundsMs().from).toDateString(),
  );
  const [token, setToken] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmountCents, setRefundAmountCents] = useState("");
  const [refundSolanaSig, setRefundSolanaSig] = useState("");
  const [refundIdempotency, setRefundIdempotency] = useState("");

  useEffect(() => {
    try {
      const t = sessionStorage.getItem(TOKEN_KEY);
      if (t) setToken(t);
    } catch {
      /* ignore */
    }
  }, []);

  const persistToken = (t: string) => {
    setToken(t);
    try {
      sessionStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* ignore */
    }
  };

  const fetchOrders = useCallback(async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Set staff bearer token (same as STAFF_MENU_PUBLISH_SECRET).");
      return;
    }
    const { from, to } = localDayBoundsMs();
    setDayLabel(new Date(from).toDateString());
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({
        from: String(from),
        to: String(to),
      });
      const res = await fetch(`/api/staff/admin/orders?${sp}`, {
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      const data = (await res.json()) as { orders?: OrderRow[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        setOrders([]);
        return;
      }
      setOrders(data.orders ?? []);
      setLastFetchedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchOrders();
    }, ORDERS_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [fetchOrders]);

  const selected = orders.find((o) => o.orderReference === selectedRef) ?? null;

  useEffect(() => {
    if (selected) {
      setRefundAmountCents(String(selected.amountCents));
      setRefundSolanaSig("");
      setRefundIdempotency("");
    }
  }, [selected]);

  async function postJson(path: string, body: Record<string, unknown>): Promise<void> {
    const trimmed = token.trim();
    if (!trimmed) {
      setActionMessage("Missing bearer token.");
      return;
    }
    setActionBusy(true);
    setActionMessage(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${trimmed}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionMessage(
          typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
        );
        return;
      }
      setActionMessage(JSON.stringify(data));
      await fetchOrders();
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  function openRefundModal(): void {
    if (!selected) return;
    setRefundAmountCents(String(selected.amountCents));
    setRefundSolanaSig("");
    setRefundIdempotency("");
    setRefundOpen(true);
  }

  async function submitRefund(): Promise<void> {
    if (!selected) return;
    const cents = Number.parseInt(refundAmountCents.trim(), DECIMAL_RADIX);
    if (!Number.isFinite(cents) || cents < REFUND_MIN_AMOUNT_CENTS) {
      setActionMessage("Refund amount (cents) must be a positive integer.");
      return;
    }
    const body: Record<string, unknown> = {
      orderReference: selected.orderReference,
      amountCents: cents,
    };
    if (selected.paymentProvider === "helius") {
      const sig = refundSolanaSig.trim();
      if (!sig) {
        setActionMessage("Solana refund transaction signature is required for Helius orders.");
        return;
      }
      body.solanaRefundTransactionSignature = sig;
    }
    const idem = refundIdempotency.trim();
    if (idem) body.idempotencyKey = idem;

    await postJson("/api/staff/admin/refund", body);
    setRefundOpen(false);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-slate-100">
      <h1 className="text-xl font-semibold tracking-tight">Admin order flow (dev)</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">
        Unauthenticated page for manual UX testing. Listing and actions still require the staff
        bearer token (<code className="rounded bg-slate-800 px-1 py-0.5 text-xs">STAFF_MENU_PUBLISH_SECRET</code>
        ). Orders shown use your browser&apos;s local calendar day ({dayLabel}).
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <label className="flex min-w-[280px] flex-1 flex-col gap-1 text-sm">
          <span className="text-slate-400">Staff bearer token</span>
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => persistToken(e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 font-mono text-sm outline-none focus:border-sky-500"
            placeholder="Bearer token…"
          />
        </label>
        <button
          type="button"
          onClick={() => void fetchOrders()}
          disabled={loading}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
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

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!selected || actionBusy}
          onClick={() =>
            selected &&
            void postJson("/api/staff/admin/fulfillment", {
              orderReference: selected.orderReference,
            })
          }
          className="rounded-md border border-emerald-700 bg-emerald-900/40 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-800/50 disabled:opacity-40"
        >
          Fulfill selected
        </button>
        <button
          type="button"
          disabled={!selected || actionBusy}
          onClick={openRefundModal}
          className="rounded-md border border-amber-700 bg-amber-900/40 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-800/50 disabled:opacity-40"
        >
          Refund selected…
        </button>
      </div>

      {actionMessage ? (
        <pre className="mt-3 max-h-32 overflow-auto rounded-md bg-slate-950/80 p-3 font-mono text-xs text-slate-300">
          {actionMessage}
        </pre>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-700 bg-slate-900/40">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="w-10 p-3" />
              <th className="p-3">Created</th>
              <th className="p-3">Reference</th>
              <th className="p-3">Provider</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Lines</th>
              <th className="p-3">Summary</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && !loading ? (
              <tr>
                <td colSpan={ORDER_TABLE_COLUMN_COUNT} className="p-6 text-center text-slate-500">
                  No orders in the selected window.
                </td>
              </tr>
            ) : null}
            {orders.map((o) => {
              const sel = selectedRef === o.orderReference;
              return (
                <tr
                  key={o.orderReference}
                  onClick={() => setSelectedRef(o.orderReference)}
                  className={`cursor-pointer border-b border-slate-800 last:border-0 ${
                    sel ? "bg-sky-950/50" : "hover:bg-slate-800/40"
                  }`}
                >
                  <td className="p-3">
                    <input
                      type="radio"
                      name="orderPick"
                      checked={sel}
                      onChange={() => setSelectedRef(o.orderReference)}
                      className="accent-sky-500"
                    />
                  </td>
                  <td className="whitespace-nowrap p-3 font-mono text-xs text-slate-300">
                    {formatTime(o.createdAt)}
                  </td>
                  <td className="max-w-[200px] truncate p-3 font-mono text-xs" title={o.orderReference}>
                    {o.orderReference}
                  </td>
                  <td className="p-3">{o.paymentProvider}</td>
                  <td className="p-3">{formatMoney(o.amountCents, o.currency)}</td>
                  <td className="p-3">{o.status}</td>
                  <td className="p-3">{o.lineCount}</td>
                  <td className="max-w-[220px] truncate p-3 text-slate-300" title={o.summaryLabel}>
                    {o.summaryLabel}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {refundOpen && selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-modal-title"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-600 bg-[#0d2137] p-6 shadow-xl">
            <h2 id="refund-modal-title" className="text-lg font-semibold">
              Refund order
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-400">{selected.orderReference}</p>

            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="text-slate-400">Amount (cents)</span>
              <input
                type="number"
                min={REFUND_MIN_AMOUNT_CENTS}
                value={refundAmountCents}
                onChange={(e) => setRefundAmountCents(e.target.value)}
                className="rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 font-mono text-sm outline-none focus:border-sky-500"
              />
            </label>

            {selected.paymentProvider === "helius" ? (
              <label className="mt-3 flex flex-col gap-1 text-sm">
                <span className="text-slate-400">Solana refund tx signature</span>
                <input
                  type="text"
                  value={refundSolanaSig}
                  onChange={(e) => setRefundSolanaSig(e.target.value)}
                  className="rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
                  placeholder="Required for Helius"
                />
              </label>
            ) : (
              <label className="mt-3 flex flex-col gap-1 text-sm">
                <span className="text-slate-400">Stripe idempotency key (optional)</span>
                <input
                  type="text"
                  value={refundIdempotency}
                  onChange={(e) => setRefundIdempotency(e.target.value)}
                  className="rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
                />
              </label>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRefundOpen(false)}
                className="rounded-md px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void submitRefund()}
                className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                Submit refund
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
