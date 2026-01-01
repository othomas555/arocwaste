import { useEffect, useMemo, useState } from "react";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const STATUS_PRESETS = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "trialing", label: "Trialing" },
  { key: "paused", label: "Paused" },
  { key: "hold", label: "Hold (unpaid)" },
  { key: "past_due", label: "Past due" },
  { key: "unpaid", label: "Unpaid" },
  { key: "canceled", label: "Canceled" },
];

function badgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "active" || s === "trialing") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (["hold", "past_due", "unpaid"].includes(s))
    return "bg-red-50 text-red-800 ring-red-200";
  if (s === "paused") return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export default function OpsSubscribersPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    id: "",
    postcode: "",
    address: "",
    frequency: "",
    extra_bags: 0,
    use_own_bin: false,
    route_day: "",
    route_area: "",
    route_override: false,
    route_override_reason: "",
    next_collection_date: "",
    pause_from: "",
    pause_to: "",
    status: "",
    ops_notes: "",
  });

  const [refreshKey, setRefreshKey] = useState(0);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);

      const res = await fetch(`/api/ops/subscribers?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load subscribers");
      setRows(Array.isArray(data?.subscribers) ? data.subscribers : []);
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  const totals = useMemo(() => {
    return {
      total: rows.length,
      activeCount: rows.filter((r) => ["active", "trialing"].includes(r.status)).length,
      holdCount: rows.filter((r) =>
        ["hold", "past_due", "unpaid"].includes(r.status)
      ).length,
    };
  }, [rows]);

  function openEditor(r) {
    setForm({
      id: r.id,
      postcode: r.postcode || "",
      address: r.address || "",
      frequency: r.frequency || "",
      extra_bags: Number(r.extra_bags) || 0,
      use_own_bin: !!r.use_own_bin,
      route_day: r.route_day || "",
      route_area: r.route_area || "",
      route_override: !!r.route_override,
      route_override_reason: r.route_override_reason || "",
      next_collection_date: r.next_collection_date || "",
      pause_from: r.pause_from || "",
      pause_to: r.pause_to || "",
      status: r.status || "",
      ops_notes: r.ops_notes || "",
    });
    setDrawerOpen(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ops/subscribers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save subscriber");

      setDrawerOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function applyRouteRules(dryRun) {
    const res = await fetch("/api/ops/apply-route-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun }),
    });
    const data = await res.json();
    alert(
      dryRun
        ? `Dry run:\nWill update ${data.toUpdate} subscribers\nSkipped: ${data.skipped}\nNo match: ${data.noMatch}`
        : `Applied route rules to ${data.applied} subscribers`
    );
    if (!dryRun) setRefreshKey((k) => k + 1);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-3 py-4">
        <h1 className="text-xl font-semibold">Ops • Subscribers</h1>

        <div className="my-3 flex gap-2">
          <button
            onClick={() => applyRouteRules(true)}
            className="rounded-xl border bg-white px-3 py-2 text-sm"
          >
            Dry run route rules
          </button>
          <button
            onClick={() => applyRouteRules(false)}
            className="rounded-xl bg-black px-3 py-2 text-sm text-white"
          >
            Apply route rules
          </button>
        </div>

        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => openEditor(r)}
            className="mb-2 w-full rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200"
          >
            <div className="font-semibold">{r.address}</div>
            <div className="text-sm text-slate-600">
              {r.postcode} • {r.route_area} • {r.route_day}
              {r.route_override && (
                <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  ROUTE OVERRIDDEN
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 bg-black/40 p-4">
          <div className="mx-auto max-w-3xl rounded-xl bg-white p-4">
            <h2 className="font-semibold">Edit subscriber</h2>

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.route_override}
                onChange={(e) =>
                  setForm({ ...form, route_override: e.target.checked })
                }
              />
              Override route rules
            </label>

            {form.route_override && (
              <input
                value={form.route_override_reason}
                onChange={(e) =>
                  setForm({ ...form, route_override_reason: e.target.value })
                }
                placeholder="Reason for override"
                className="mt-2 w-full rounded border px-2 py-1 text-sm"
              />
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                value={form.route_area}
                onChange={(e) =>
                  setForm({ ...form, route_area: e.target.value })
                }
                disabled={!form.route_override}
                placeholder="Route area"
                className="rounded border px-2 py-1"
              />
              <select
                value={form.route_day}
                onChange={(e) =>
                  setForm({ ...form, route_day: e.target.value })
                }
                disabled={!form.route_override}
                className="rounded border px-2 py-1"
              >
                <option value="">—</option>
                {["Monday","Tuesday","Wednesday","Thursday","Friday"].map((d)=>(
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={save}
                className="rounded bg-emerald-600 px-4 py-2 text-white"
              >
                Save
              </button>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded border px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
