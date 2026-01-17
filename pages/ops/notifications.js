// pages/ops/notifications.js
import Link from "next/link";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

function fmtDT(s) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

export default function OpsNotificationsPage({
  rows,
  total,
  page,
  pageSize,
  filters,
  error,
}) {
  const totalPages = Math.max(1, Math.ceil((Number(total || 0) || 0) / (Number(pageSize) || 25)));

  const qs = (next) => {
    const p = new URLSearchParams();
    p.set("page", String(next.page ?? page));
    p.set("pageSize", String(next.pageSize ?? pageSize));
    if (next.status ?? filters.status) p.set("status", String(next.status ?? filters.status));
    if (next.event_type ?? filters.event_type) p.set("event_type", String(next.event_type ?? filters.event_type));
    if (next.target_type ?? filters.target_type) p.set("target_type", String(next.target_type ?? filters.target_type));
    if (next.target_id ?? filters.target_id) p.set("target_id", String(next.target_id ?? filters.target_id));
    if (next.q ?? filters.q) p.set("q", String(next.q ?? filters.q));
    return `/ops/notifications?${p.toString()}`;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-gray-600">
            Read-only view of queued/sent/cancelled emails from{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">notification_queue</code>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/ops" className="text-sm underline">
            Back to Ops
          </Link>
          <Link
            href={qs({})}
            className="text-sm px-3 py-2 rounded bg-black text-white"
          >
            Refresh
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-red-900 text-sm">
          {error}
        </div>
      ) : null}

      <form method="GET" className="rounded border p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Status</label>
            <select
              className="w-full border rounded px-2 py-2 text-sm"
              name="status"
              defaultValue={filters.status || ""}
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
              name="event_type"
              defaultValue={filters.event_type || ""}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Target type</label>
            <input
              className="w-full border rounded px-2 py-2 text-sm"
              placeholder="e.g. subscription"
              name="target_type"
              defaultValue={filters.target_type || ""}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Target id</label>
            <input
              className="w-full border rounded px-2 py-2 text-sm"
              placeholder="exact match"
              name="target_id"
              defaultValue={filters.target_id || ""}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Search</label>
            <input
              className="w-full border rounded px-2 py-2 text-sm"
              placeholder="email / target_id / event_type"
              name="q"
              defaultValue={filters.q || ""}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">Page size</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              name="pageSize"
              defaultValue={String(pageSize || 25)}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <input type="hidden" name="page" value="1" />
          </div>

          <button className="text-sm px-3 py-2 rounded border" type="submit">
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
            <Link
              className={cx("px-2 py-1 text-sm rounded border", page <= 1 ? "pointer-events-none opacity-50" : "")}
              href={qs({ page: Math.max(1, page - 1) })}
            >
              Prev
            </Link>
            <div className="text-sm">
              Page <b>{page}</b> / <b>{totalPages}</b>
            </div>
            <Link
              className={cx("px-2 py-1 text-sm rounded border", page >= totalPages ? "pointer-events-none opacity-50" : "")}
              href={qs({ page: Math.min(totalPages, page + 1) })}
            >
              Next
            </Link>
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
              {rows.length === 0 ? (
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

export async function getServerSideProps(ctx) {
  try {
    const q = ctx.query || {};
    const page = Math.max(1, Math.min(5000, Number(q.page || 1) || 1));
    const pageSize = Math.max(25, Math.min(100, Number(q.pageSize || 25) || 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const filters = {
      status: String(q.status || "").trim(),
      event_type: String(q.event_type || "").trim(),
      target_type: String(q.target_type || "").trim(),
      target_id: String(q.target_id || "").trim(),
      q: String(q.q || "").trim(),
    };

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return { props: { rows: [], total: 0, page, pageSize, filters, error: "Supabase admin not configured" } };
    }

    let query = supabase
      .from("notification_queue")
      .select(
        "id, created_at, event_type, target_type, target_id, recipient_email, scheduled_at, status, sent_at, cancelled_at, last_error, payload",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.event_type) query = query.eq("event_type", filters.event_type);
    if (filters.target_type) query = query.eq("target_type", filters.target_type);
    if (filters.target_id) query = query.eq("target_id", filters.target_id);

    if (filters.q) {
      const esc = filters.q.replace(/,/g, "");
      query = query.or(
        `recipient_email.ilike.%${esc}%,target_id.ilike.%${esc}%,event_type.ilike.%${esc}%`
      );
    }

    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return { props: { rows: [], total: 0, page, pageSize, filters, error: error.message } };
    }

    return {
      props: {
        rows: data || [],
        total: Number(count || 0),
        page,
        pageSize,
        filters,
        error: "",
      },
    };
  } catch (e) {
    return {
      props: {
        rows: [],
        total: 0,
        page: 1,
        pageSize: 25,
        filters: { status: "", event_type: "", target_type: "", target_id: "", q: "" },
        error: e?.message || "Failed to load notifications",
      },
    };
  }
}
