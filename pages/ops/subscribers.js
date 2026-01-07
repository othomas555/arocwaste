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

export default function OpsSubscribers({ initial }) {
  const [rows, setRows] = useState(initial || []);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      if (!res.ok) throw new Error(json?.error || "Failed to load");
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

      // refresh list row (status + notes)
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

          {error ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

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
                  <th className="px
