import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "../../../lib/supabaseClient";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function DriverRunPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [staff, setStaff] = useState(null);
  const [run, setRun] = useState(null);
  const [stops, setStops] = useState([]);
  const [totals, setTotals] = useState({ totalStops: 0, totalExtraBags: 0 });

  async function getTokenOrRedirect() {
    if (!supabaseClient) throw new Error("Supabase client not configured.");
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      window.location.href = "/driver/login";
      return null;
    }
    return token;
  }

  async function load() {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const token = await getTokenOrRedirect();
      if (!token) return;

      const res = await fetch(`/api/driver/run/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load run");

      setStaff(data.staff || null);
      setRun(data.run || null);
      setStops(Array.isArray(data.stops) ? data.stops : []);
      setTotals(data.totals || { totalStops: 0, totalExtraBags: 0 });
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const staffNames = useMemo(() => {
    if (!run?.daily_run_staff) return "";
    return run.daily_run_staff.map((x) => x.staff?.name).filter(Boolean).join(", ");
  }, [run]);

  const vehicleLabel = useMemo(() => {
    if (!run?.vehicles) return "— no vehicle —";
    const v = run.vehicles;
    return `${v.registration}${v.name ? ` • ${v.name}` : ""}`;
  }, [run]);

  async function markCollected(subscription_id) {
    setSavingId(subscription_id);
    setError("");
    try {
      const token = await getTokenOrRedirect();
      if (!token) return;

      const res = await fetch("/api/driver/mark-collected", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ run_id: id, subscription_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed");
      await load();
    } catch (e) {
      setError(e.message || "Failed");
    } finally {
      setSavingId("");
    }
  }

  async function undoCollected(subscription_id) {
    setSavingId(subscription_id);
    setError("");
    try {
      const token = await getTokenOrRedirect();
      if (!token) return;

      const res = await fetch("/api/driver/undo-collected", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ run_id: id, subscription_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed");
      await load();
    } catch (e) {
      setError(e.message || "Failed");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link href="/driver/my-runs" className="text-sm font-semibold text-slate-900">
              ← Back to my runs
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-slate-900">Run</h1>
            <p className="text-sm text-slate-600">{staff ? `Logged in as ${staff.name}` : ""}</p>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            Loading…
          </div>
        ) : !run ? (
          <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            Run not found.
          </div>
        ) : (
          <>
            <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="text-base font-semibold text-slate-900">
                {run.route_area} • {run.route_day}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-slate-700">{run.run_date}</span>
                <span className="mx-2 text-slate-300">•</span>
                <span className="font-medium text-slate-700">{vehicleLabel}</span>
                <span className="mx-2 text-slate-300">•</span>
                <span>{staffNames || "No staff assigned"}</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-600">Stops</div>
                  <div className="text-lg font-semibold text-slate-900">{totals.totalStops}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-600">Extra bags</div>
                  <div className="text-lg font-semibold text-slate-900">{totals.totalExtraBags}</div>
                </div>
              </div>
            </div>

            {stops.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                No due stops for this run.
              </div>
            ) : (
              <div className="mt-4 space-y-2 pb-10">
                {stops.map((s) => (
                  <div key={s.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-slate-900">
                          {s.address}
                          {s.collected ? (
                            <span className="ml-2 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                              collected
                            </span>
                          ) : (
                            <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                              due
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {s.postcode}
                          <span className="mx-2 text-slate-300">•</span>
                          Extra bags: <span className="font-semibold text-slate-800">{Number(s.extra_bags) || 0}</span>
                          <span className="mx-2 text-slate-300">•</span>
                          {s.use_own_bin ? "Own bin" : "Company bin"}
                        </div>
                        {s.ops_notes ? <div className="mt-1 text-xs text-slate-500">{s.ops_notes}</div> : null}
                      </div>

                      <div className="shrink-0 flex gap-2">
                        {s.collected ? (
                          <button
                            type="button"
                            onClick={() => undoCollected(s.id)}
                            disabled={savingId === s.id}
                            className={cx(
                              "rounded-xl px-3 py-2 text-sm font-semibold ring-1",
                              savingId === s.id
                                ? "bg-slate-200 text-slate-500 ring-slate-200"
                                : "bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100"
                            )}
                          >
                            Undo
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => markCollected(s.id)}
                            disabled={savingId === s.id}
                            className={cx(
                              "rounded-xl px-3 py-2 text-sm font-semibold ring-1",
                              savingId === s.id
                                ? "bg-slate-200 text-slate-500 ring-slate-200"
                                : "bg-emerald-600 text-white ring-emerald-700 hover:bg-emerald-700"
                            )}
                          >
                            Collected
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
