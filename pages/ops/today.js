import { useEffect, useMemo, useState } from "react";

function todayLondonISO() {
  // Returns YYYY-MM-DD for Europe/London without adding deps
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // en-CA => YYYY-MM-DD
}

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function OpsTodayPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const today = useMemo(() => todayLondonISO(), []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/ops/today?date=${encodeURIComponent(today)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load today list");
      setRows(Array.isArray(data?.subscriptions) ? data.subscriptions : []);
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

  async function markCollected(subscription_id) {
    setBusyId(subscription_id);
    setError("");
    try {
      const res = await fetch("/api/ops/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription_id,
          collected_date: today,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to mark collected");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  async function undoLast(subscription_id) {
    setBusyId(subscription_id);
    setError("");
    try {
      const res = await fetch("/api/ops/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to undo");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  const totalStops = rows.length;
  const totalExtraBags = rows.reduce((sum, r) => sum + (Number(r.extra_bags) || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-3 py-4">
        <div className="sticky top-0 z-10 -mx-3 mb-3 bg-slate-50/90 px-3 py-2 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Ops • Today</h1>
              <p className="text-sm text-slate-600">
                Due collections for <span className="font-medium">{today}</span>
              </p>
            </div>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm active:scale-[0.99]"
              type="button"
            >
              Refresh
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="text-xs uppercase tracking-wide text-slate-500">Stops</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{totalStops}</div>
            </div>
            <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="text-xs uppercase tracking-wide text-slate-500">Extra bags</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{totalExtraBags}</div>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm text-slate-600">Loading today’s list…</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm text-slate-700">Nothing due today.</div>
          </div>
        ) : (
          <div className="space-y-2 pb-10">
            {rows.map((r) => {
              const busy = busyId === r.id;
              return (
                <div
                  key={r.id}
                  className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
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
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                          {r.frequency || "frequency?"}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                          {r.use_own_bin ? "Own bin" : "Our bin"}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                          Extra bags: {Number(r.extra_bags) || 0}
                        </span>
                        {r.status ? (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {r.status}
                          </span>
                        ) : null}
                      </div>

                      {r.ops_notes ? (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                            Notes
                          </div>
                          <div className="mt-1 whitespace-pre-wrap">{r.ops_notes}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => markCollected(r.id)}
                      disabled={busy}
                      className={cx(
                        "rounded-xl px-4 py-3 text-sm font-semibold shadow-sm ring-1 active:scale-[0.99]",
                        busy
                          ? "bg-slate-200 text-slate-500 ring-slate-200"
                          : "bg-emerald-600 text-white ring-emerald-700 hover:bg-emerald-700"
                      )}
                    >
                      {busy ? "Working…" : "Collected ✓"}
                    </button>

                    <button
                      type="button"
                      onClick={() => undoLast(r.id)}
                      disabled={busy}
                      className={cx(
                        "rounded-xl px-4 py-3 text-sm font-semibold shadow-sm ring-1 active:scale-[0.99]",
                        busy
                          ? "bg-slate-200 text-slate-500 ring-slate-200"
                          : "bg-white text-slate-900 ring-slate-300 hover:bg-slate-50"
                      )}
                    >
                      Undo ↩
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
