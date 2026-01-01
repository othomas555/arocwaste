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
  if (s === "hold" || s === "past_due" || s === "unpaid")
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

  const [open, setOpen] = useState(false);
  const [activeRow, setActiveRow] = useState(null);
  const [saving, setSaving] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);

      const res = await fetch(`/api/ops/subscribers?${params.toString()}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const totals = useMemo(() => {
    const total = rows.length;
    const activeCount = rows.filter((r) => ["active", "trialing"].includes(String(r.status))).length;
    const holdCount = rows.filter((r) =>
      ["hold", "past_due", "unpaid"].includes(String(r.status))
    ).length;
    return { total, activeCount, holdCount };
  }, [rows]);

  function openEditor(r) {
    setActiveRow({
      id: r.id,
      postcode: r.postcode || "",
      address: r.address || "",
      frequency: r.frequency || "",
      extra_bags: r.extra_bags || 0,
      use_own_bin: !!r.use_own_bin,
      route_day: r.route_day || "",
      route_area: r.route_area || "",
      driver_id: r.driver_id || "",
      route_id: r.route_id || "",
      next_collection_date: r.next_collection_date || "",
      pause_from: r.pause_from || "",
      pause_to: r.pause_to || "",
      status: r.status || "",
      ops_notes: r.ops_notes || "",
    });
    setOpen(true);
  }

  function closeEditor() {
    setOpen(false);
    setActiveRow(null);
  }

  async function save() {
    if (!activeRow?.id) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ops/subscribers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeRow.id,
          status: activeRow.status || null,
          route_day: activeRow.route_day || null,
          route_area: activeRow.route_area || null,
          driver_id: activeRow.driver_id || null,
          route_id: activeRow.route_id || null,
          next_collection_date: activeRow.next_collection_date || null,
          pause_from: activeRow.pause_from || null,
          pause_to: activeRow.pause_to || null,
          ops_notes: activeRow.ops_notes || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save subscriber");

      setRefreshKey((k) => k + 1);
      setOpen(false);
      setActiveRow(null);
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-3 py-4">
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-slate-900">Ops • Subscribers</h1>
          <p className="text-sm text-slate-600">
            Set route day/area, next collection date, and hold accounts if unpaid.
          </p>
        </div>

        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs uppercase tracking-wide text-slate-500">Total</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{totals.total}</div>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs uppercase tracking-wide text-slate-500">Active/Trialing</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{totals.activeCount}</div>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs uppercase tracking-wide text-slate-500">Hold/Past due</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{totals.holdCount}</div>
          </div>
        </div>

        <div className="mb-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, postcode, address, email, route area…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
            />

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none md:w-56"
            >
              {STATUS_PRESETS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm active:scale-[0.99]"
            >
              Search
            </button>
          </div>

          {error ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm text-slate-600">Loading subscribers…</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm text-slate-700">No subscribers found.</div>
          </div>
        ) : (
          <div className="space-y-2 pb-10">
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => openEditor(r)}
                className="w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 active:scale-[0.999]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-slate-900">
                      {r.address || "Address missing"}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      <span className="font-medium text-slate-700">{r.postcode}</span>
                      {r.route_area ? (
                        <>
                          <span className="mx-2 text-slate-300">•</span>
                          <span>{r.route_area}</span>
                        </>
                      ) : null}
                      {r.route_day ? (
                        <>
                          <span className="mx-2 text-slate-300">•</span>
                          <span>{r.route_day}</span>
                        </>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={cx("rounded-full px-3 py-1 text-xs font-semibold ring-1", badgeClass(r.status))}>
                        {r.status || "status?"}
                      </span>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {r.frequency || "frequency?"}
                      </span>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        Extra bags: {Number(r.extra_bags) || 0}
                      </span>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        Next: {r.next_collection_date || "—"}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-slate-500">Edit</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {open && activeRow ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={closeEditor} />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-5xl rounded-t-3xl bg-white p-4 shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900">Edit subscriber</div>
                <div className="mt-1 text-sm text-slate-600">
                  {activeRow.postcode} • {activeRow.address}
                </div>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-600">Status</label>
                <select
                  value={activeRow.status || ""}
                  onChange={(e) => setActiveRow({ ...activeRow, status: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">(blank)</option>
                  <option value="active">active</option>
                  <option value="trialing">trialing</option>
                  <option value="paused">paused</option>
                  <option value="hold">hold (unpaid)</option>
                  <option value="past_due">past_due</option>
                  <option value="unpaid">unpaid</option>
                  <option value="canceled">canceled</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Driver lists only include <span className="font-semibold">active</span> /
                  <span className="font-semibold">trialing</span>.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Next collection date</label>
                <input
                  value={activeRow.next_collection_date || ""}
                  onChange={(e) =>
                    setActiveRow({ ...activeRow, next_collection_date: e.target.value })
                  }
                  placeholder="YYYY-MM-DD"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Route area</label>
                <input
                  value={activeRow.route_area || ""}
                  onChange={(e) => setActiveRow({ ...activeRow, route_area: e.target.value })}
                  placeholder="e.g. Porthcawl"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Route day</label>
                <select
                  value={activeRow.route_day || ""}
                  onChange={(e) => setActiveRow({ ...activeRow, route_day: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">(not set)</option>
                  <option value="Monday">Monday</option>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Wednesday">Wednesday</option>
                  <option value="Thursday">Thursday</option>
                  <option value="Friday">Friday</option>
                  <option value="Saturday">Saturday</option>
                  <option value="Sunday">Sunday</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Pause from</label>
                <input
                  value={activeRow.pause_from || ""}
                  onChange={(e) => setActiveRow({ ...activeRow, pause_from: e.target.value })}
                  placeholder="YYYY-MM-DD"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Pause to</label>
                <input
                  value={activeRow.pause_to || ""}
                  onChange={(e) => setActiveRow({ ...activeRow, pause_to: e.target.value })}
                  placeholder="YYYY-MM-DD"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-slate-600">Ops notes</label>
                <textarea
                  value={activeRow.ops_notes || ""}
                  onChange={(e) => setActiveRow({ ...activeRow, ops_notes: e.target.value })}
                  placeholder="Gate code, side access, bin location, etc."
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className={cx(
                  "rounded-xl px-4 py-3 text-sm font-semibold shadow-sm ring-1 active:scale-[0.99]",
                  saving
                    ? "bg-slate-200 text-slate-500 ring-slate-200"
                    : "bg-emerald-600 text-white ring-emerald-700 hover:bg-emerald-700"
                )}
              >
                {saving ? "Saving…" : "Save"}
              </button>

              <button
                type="button"
                onClick={closeEditor}
                className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50 active:scale-[0.99]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
