// pages/ops/notifications.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "../../lib/supabaseClient";

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

function fmtDT(s) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function StatusPill({ status }) {
  const s = String(status || "").toLowerCase();
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border";
  const cls =
    s === "sent"
      ? "bg-green-50 border-green-200 text-green-700"
      : s === "queued" || s === "pending"
      ? "bg-amber-50 border-amber-200 text-amber-700"
      : s === "cancelled"
      ? "bg-gray-50 border-gray-200 text-gray-700"
      : "bg-red-50 border-red-200 text-red-700";
  return <span className={cx(base, cls)}>{status || "—"}</span>;
}

export default function OpsNotificationsPage() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [status, setStatus] = useState("");
  const [eventType, setEventType] = useState("");
  const [q, setQ] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");

  // Paging
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const totalPages = useMemo(() => {
    const n = Math.max(1, Math.ceil((total || 0) / pageSize));
    return n;
  }, [total, pageSize]);

  useEffect(() => {
    let alive = true;

    async function boot() {
      try {
        if (!supabaseClient) {
          if (alive) {
            setError("Supabase client not configured (missing NEXT_PUBLIC env vars).");
            setLoadingSession(false);
          }
          return;
        }

        const { data } = await supabaseClient.auth.getSession();
        if (!alive) return;
        setSession(data?.session || null);
      } finally {
        if (alive) setLoadingSession(false);
      }
    }

    boot();

    return () => {
      alive = false;
    };
  }, []);

  async function load() {
    setLoading(true);
    setError("");

    try {
      if (!session?.access_token) {
        setError("You are not signed in.");
        setRows([]);
        setTotal(0);
        return;
      }

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (status) params.set("status", status);
      if (eventType) params.set("event_type", eventType);
      if (q) params.set("q", q);
      if (targetType) params.set("target_type", targetType);
      if (targetId) params.set("target_id", targetId);

      const res = await fetch(`/api/ops/notifications?${params.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }

      setRows(Array.isArray(json.rows) ? json.rows : []);
      setTotal(Number(json.total || 0));
    } catch (e) {
      setError(e?.message || "Failed to load notifications");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!loadingSession) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingSession, page, pageSize, status, eventType, targetType, targetId]);

  function onApplySearch(e) {
    e.preventDefault();
    setPage(1);
    load();
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-gray-600">
            Read-only view of queued/sent/cancelled emails from <code className="px-1 py-0.5 bg-gray-100 rounded">notification_queue</code>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/ops" className="text-sm underline">
            Back to Ops
          </Link>
          <button
            onClick={load}
            className="text-sm px-3 py-2 rounded bg-black text-white disabled:opacity-50"
            disabled={loading || loadingSession}
          >
            Refresh
          </button>
        </div>
      </div>

      {loadingSession ? (
        <div className="text-sm text-gray-600">Loading session…</div>
      ) : !session ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900 text-sm">
          You’re not signed in. Open an Ops page that signs you in, then come back here.
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-red-900 text-sm">{error}</div>
      ) : null}

      <form onSubmit={onApplySearch} className="rounded border p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Status</label>
            <select
              className="w-full border rounded px-2 py-2 text-sm"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">All</option>
              <option value="queued">queued</option>
              <option value="pending">pending</option>
              <option value="sent">sent</option>
              <option value="cancelled">cancelled</option>
              <option value="failed">failed</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Event type</label>
            <input
              className="w-full border rounded px-2 py-2 text-sm"
              placeholder="e.g. subscription_collected"
              value={eventType}
              onChange={(e) => {
                setPage(1);
                setEventType(e.target.value);
              }}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Target type</label>
            <input
              className="w-full border rounded px-2 py-2 text-sm"
              placeholder="e.g. subscription"
              value={targetType}
              onChange={(e) => {
                setPage(1);
                setTargetType(e.target.value);
              }}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Target id</label>
            <input
              className="w-full border rounded px-2 py-2 text-sm"
              placeholder="exact match"
              value={targetId}
              onChange={(e) => {
                setPage(1);
                setTargetId(e.target.value);
              }}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Search</label>
            <input
              className="w-full border rounded px-2 py-2 text-sm"
              placeholder="email / target_id / event_type"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">Page size</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value) || 25);
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <button className="text-sm px-3 py-2 rounded border" type="submit" disabled={loading}>
            Apply search
          </button>
        </div>
      </form>

      <div className="rounded border overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 text-sm flex items-center justify-between">
          <div>
            Showing <b>{rows.length}</b> of <b>{total}</b>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 text-sm rounded border disabled:opacity-50"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <div className="text-sm">
              Page <b>{page}</b> / <b>{totalPages}</b>
            </div>
            <button
              className="px-2 py-1 text-sm rounded border disabled:opacity-50"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-white sticky top-0">
              <tr className="border-b">
                <th className="text-left p-3">Created</th>
                <th className="text-left p-3">Event</th>
                <th className="text-left p-3">Recipient</th>
                <th className="text-left p-3">Target</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Scheduled</th>
                <th className="text-left p-3">Sent</th>
                <th className="text-left p-3">Cancelled</th>
                <th className="text-left p-3">Error</th>
                <th className="text-left p-3">Payload</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-4 text-gray-600" colSpan={10}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="p-4 text-gray-600" colSpan={10}>
                    No notifications found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3 whitespace-nowrap">{fmtDT(r.created_at)}</td>
                    <td className="p-3 whitespace-nowrap">
                      <code className="px-1 py-0.5 bg-gray-100 rounded">{r.event_type || "—"}</code>
                    </td>
                    <td className="p-3 whitespace-nowrap">{r.recipient_email || "—"}</td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="text-xs text-gray-600">{r.target_type || "—"}</div>
                      <div className="font-mono text-xs">{r.target_id || "—"}</div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="p-3 whitespace-nowrap">{fmtDT(r.scheduled_at)}</td>
                    <td className="p-3 whitespace-nowrap">{fmtDT(r.sent_at)}</td>
                    <td className="p-3 whitespace-nowrap">{fmtDT(r.cancelled_at)}</td>
                    <td className="p-3">
                      {r.last_error ? (
                        <div className="text-xs text-red-700 whitespace-pre-wrap max-w-[260px]">{r.last_error}</div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3">
                      <details>
                        <summary className="cursor-pointer text-xs underline">view</summary>
                        <pre className="mt-2 text-xs bg-gray-50 border rounded p-2 max-w-[420px] overflow-auto">
{JSON.stringify(r.payload || {}, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Tip: filter <code className="px-1 py-0.5 bg-gray-100 rounded">status=queued</code> to see what will send next.
      </div>
    </div>
  );
}
