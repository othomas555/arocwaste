// pages/ops/subscribers.js
import { useMemo, useState } from "react";
import Link from "next/link";

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "threeweekly", label: "3-weekly" },
];

const STATUSES = ["", "active", "pending", "paused", "cancelled", "inactive"];

function formatYMD(d) {
  if (!d) return "";
  return String(d).slice(0, 10);
}

function statusBadge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "ok") return "bg-emerald-100 text-emerald-800";
  if (s === "mismatch") return "bg-amber-100 text-amber-800";
  if (s === "error") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
}

export default function OpsSubscribers({ initial, _error }) {
  const [rows, setRows] = useState(initial || []);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(_error || "");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState(null);

  const [billingRunning, setBillingRunning] = useState(false);
  const [billingResult, setBillingResult] = useState(null);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (status && String(r.status || "").toLowerCase() !== status) return false;
      if (!qq) return true;
      const hay = [
        r.email,
        r.name,
        r.phone,
        r.postcode,
        r.address,
        r.route_area,
        r.route_day,
        r.route_slot,
        r.frequency,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qq);
    });
  }, [rows, q, status]);

  async function refresh() {
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      params.set("limit", "300");

      const res = await fetch(`/api/ops/subscriptions?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Failed to load (${res.status})`);
      setRows(json.data || []);
    } catch (e) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  function openEdit(r) {
    setError("");
    setBillingResult(null);
    setEdit({
      id: r.id,
      email: r.email || "",
      name: r.name || "",
      phone: r.phone || "",
      postcode: r.postcode || "",
      address: r.address || "",
      status: r.status || "pending",
      frequency: r.frequency || "weekly",
      extra_bags: Number(r.extra_bags || 0),
      use_own_bin: !!r.use_own_bin,
      route_area: r.route_area || "",
      route_day: r.route_day || "",
      route_slot: r.route_slot || "",
      next_collection_date: formatYMD(r.next_collection_date),
      anchor_date: formatYMD(r.anchor_date),
      pause_until: formatYMD(r.pause_until),
      paused_reason: r.paused_reason || "",
      billing_alignment_status: r.billing_alignment_status || "unknown",
      billing_alignment_notes: r.billing_alignment_notes || "",
      billing_alignment_checked_at: r.billing_alignment_checked_at || null,
    });
    setOpen(true);
  }

  async function saveEdit() {
    if (!edit?.id) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/ops/subscriptions/${encodeURIComponent(edit.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: edit.status,
          frequency: edit.frequency,
          extra_bags: Number(edit.extra_bags || 0),

          name: edit.name,
          phone: edit.phone,
          postcode: edit.postcode,
          address: edit.address,

          route_area: edit.route_area,
          route_day: edit.route_day,
          route_slot: edit.route_slot,

          next_collection_date: edit.next_collection_date || null,
          anchor_date: edit.anchor_date || null,

          pause_until: edit.pause_until || null,
          paused_reason: edit.paused_reason || null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Save failed");

      const updated = json.data;
      setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      setOpen(false);
      setEdit(null);
    } catch (e) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function billingSync(action) {
    if (!edit?.id) return;
    setBillingRunning(true);
    setError("");
    setBillingResult(null);
    try {
      const res = await fetch(
        `/api/ops/subscriptions/${encodeURIComponent(edit.id)}/billing-sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Billing sync failed");

      setBillingResult(json);
      await refresh();
    } catch (e) {
      setError(e?.message || "Billing sync failed");
    } finally {
      setBillingRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Subscribers</h1>
            <p className="text-sm text-gray-600">
              Edit customers + keep Supabase billing aligned with Stripe.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/ops/dashboard"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Back to dashboard
            </Link>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className={classNames(
                "rounded-lg px-3 py-2 text-sm font-semibold",
                loading ? "bg-gray-300 text-gray-600" : "bg-gray-900 text-white hover:bg-black"
              )}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <div className="font-semibold">Subscribers list error</div>
            <div className="mt-1">{error}</div>
            <div className="mt-2 text-xs text-red-700">
              Most common fix: your Vercel env vars for Supabase admin are missing or incorrect
              (service role key), so the ops API can’t read the table.
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search email, postcode, area, name…"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 sm:max-w-md"
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 sm:max-w-xs"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s ? `Status: ${s}` : "All statuses"}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs text-gray-500">{filtered.length} shown</div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1300px] w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Billing</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Postcode</th>
                  <th className="px-3 py-2 text-left">Frequency</th>
                  <th className="px-3 py-2 text-left">Bags</th>
                  <th className="px-3 py-2 text-left">Route</th>
                  <th className="px-3 py-2 text-left">Next</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.length ? (
                  filtered.map((r) => (
                    <tr key={r.id} className="bg-white">
                      <td className="px-3 py-2">
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800">
                          {r.status || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={classNames(
                            "rounded-md px-2 py-1 text-xs font-semibold",
                            statusBadge(r.billing_alignment_status)
                          )}
                          title={r.billing_alignment_notes || ""}
                        >
                          {r.billing_alignment_status || "unknown"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-900">{r.email || "—"}</td>
                      <td className="px-3 py-2 text-gray-900">{r.postcode || "—"}</td>
                      <td className="px-3 py-2 text-gray-900">{r.frequency || "—"}</td>
                      <td className="px-3 py-2 text-gray-900">{Number(r.extra_bags || 0)}</td>
                      <td className="px-3 py-2 text-gray-900">
                        {r.route_area ? (
                          <>
                            {r.route_area} • {r.route_day || "—"}
                            {r.route_slot ? ` • ${r.route_slot}` : ""}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-900">
                        {r.next_collection_date ? formatYMD(r.next_collection_date) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-8 text-center text-sm text-gray-600" colSpan={9}>
                      {error
                        ? "No data loaded due to API error above."
                        : "No subscribers found (or none match your filters)."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal (unchanged from previous version, kept minimal here) */}
        {open && edit ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl">
              <div className="border-b border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Edit subscriber</div>
                    <div className="mt-1 text-xs text-gray-600">
                      {edit.email} • {edit.postcode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setEdit(null);
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="p-4">
                <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-gray-900">
                      Billing alignment:{" "}
                      <span
                        className={classNames(
                          "ml-1 rounded-md px-2 py-1 text-xs font-semibold",
                          statusBadge(edit.billing_alignment_status)
                        )}
                      >
                        {edit.billing_alignment_status || "unknown"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => billingSync("check")}
                        disabled={billingRunning}
                        className={classNames(
                          "rounded-lg px-3 py-1.5 text-xs font-semibold",
                          billingRunning
                            ? "bg-gray-300 text-gray-600"
                            : "bg-gray-900 text-white hover:bg-black"
                        )}
                      >
                        {billingRunning ? "Working…" : "Check Stripe"}
                      </button>
                      <button
                        type="button"
                        onClick={() => billingSync("apply")}
                        disabled={billingRunning}
                        className={classNames(
                          "rounded-lg px-3 py-1.5 text-xs font-semibold",
                          billingRunning
                            ? "bg-gray-300 text-gray-600"
                            : "bg-emerald-600 text-white hover:bg-emerald-700"
                        )}
                      >
                        {billingRunning ? "Working…" : "Apply to Stripe"}
                      </button>
                    </div>
                  </div>

                  {billingResult ? (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-800">
                      <div className="font-semibold">
                        Result: {billingResult.aligned ? "✅ aligned" : "⚠️ mismatch"}
                      </div>
                      {billingResult.notes?.length ? (
                        <ul className="mt-2 list-disc pl-5">
                          {billingResult.notes.map((n, i) => (
                            <li key={i}>{n}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {/* minimal edit fields relevant to your question */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Frequency</label>
                    <select
                      value={edit.frequency}
                      onChange={(e) => setEdit({ ...edit, frequency: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      {FREQUENCIES.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Extra bags</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={edit.extra_bags}
                      onChange={(e) => setEdit({ ...edit, extra_bags: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setEdit(null);
                    }}
                    disabled={saving}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={saving}
                    className={classNames(
                      "rounded-lg px-4 py-2 text-sm font-semibold",
                      saving ? "bg-gray-300 text-gray-600" : "bg-gray-900 text-white hover:bg-black"
                    )}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  Workflow: change frequency/bags → Save → Check Stripe → Apply to Stripe if mismatch.
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export async function getServerSideProps(ctx) {
  const proto = (ctx.req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = ctx.req.headers["x-forwarded-host"] || ctx.req.headers.host;
  const baseUrl = `${proto}://${host}`;

  try {
    const res = await fetch(`${baseUrl}/api/ops/subscriptions?limit=200`, {
      headers: {
        authorization: ctx.req.headers.authorization || "",
        cookie: ctx.req.headers.cookie || "",
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { props: { initial: [], _error: json?.error || "Failed to load" } };
    return { props: { initial: json.data || [], _error: "" } };
  } catch (e) {
    return { props: { initial: [], _error: e?.message || "Failed to load" } };
  }
}
