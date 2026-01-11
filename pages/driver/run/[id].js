import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "../../../lib/supabaseClient";

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

function moneyGBP(pence) {
  const n = Number(pence);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n / 100);
}

export default function DriverRunPage() {
  const router = useRouter();
  const { id } = router.query;

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");

  const [run, setRun] = useState(null);
  const [stops, setStops] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [totals, setTotals] = useState({
    totalStops: 0,
    totalExtraBags: 0,
    totalBookings: 0,
    totalCompletedBookings: 0,
  });

  useEffect(() => {
    let mounted = true;
    async function init() {
      if (!supabaseClient) return;
      const { data } = await supabaseClient.auth.getSession();
      if (!mounted) return;
      setSession(data?.session || null);
    }
    init();
    const { data: sub } = supabaseClient.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function load() {
    if (!id) return;
    setError("");
    setLoading(true);
    try {
      const token = session?.access_token;
      if (!token) throw new Error("Not logged in.");

      const res = await fetch(`/api/driver/run/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load run");

      setRun(json.run || null);
      setStops(Array.isArray(json.stops) ? json.stops : []);
      setBookings(Array.isArray(json.bookings) ? json.bookings : []);
      setTotals(
        json.totals || { totalStops: 0, totalExtraBags: 0, totalBookings: 0, totalCompletedBookings: 0 }
      );
    } catch (e) {
      setError(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session?.access_token && id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, id]);

  const vehicleLabel = useMemo(() => {
    if (!run?.vehicles) return "— no vehicle —";
    return `${run.vehicles.registration}${run.vehicles.name ? ` • ${run.vehicles.name}` : ""}`;
  }, [run]);

  async function markCollected(subscription_id) {
    setSavingKey(subscription_id);
    setError("");
    try {
      const token = session?.access_token;
      if (!token) throw new Error("Not logged in.");

      const res = await fetch("/api/driver/mark-collected", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          run_id: run?.id,
          subscription_id,
          collected_date: run?.run_date,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to mark collected");
      await load();
    } catch (e) {
      setError(e?.message || "Failed to mark collected");
    } finally {
      setSavingKey("");
    }
  }

  async function undoCollected(subscription_id) {
    setSavingKey(subscription_id);
    setError("");
    try {
      const token = session?.access_token;
      if (!token) throw new Error("Not logged in.");

      const res = await fetch("/api/driver/undo-collected", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          run_id: run?.id,
          subscription_id,
          collected_date: run?.run_date,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to undo");
      await load();
    } catch (e) {
      setError(e?.message || "Failed to undo");
    } finally {
      setSavingKey("");
    }
  }

  async function setBookingCompleted(booking_id, completed) {
    setSavingKey(`booking:${booking_id}`);
    setError("");
    try {
      const token = session?.access_token;
      if (!token) throw new Error("Not logged in.");

      const res = await fetch("/api/driver/bookings/set-completed", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ booking_id, completed, run_id: run?.id }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to update booking");
      await load();
    } catch (e) {
      setError(e?.message || "Failed to update booking");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Driver • Run</h1>
            <p className="text-sm text-slate-600">Tick off collections as you go.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/driver/my-runs" className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              My runs
            </Link>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        ) : null}

        {!session?.access_token ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
            You’re not logged in. Go to{" "}
            <Link className="underline font-semibold" href="/driver/login">
              /driver/login
            </Link>
            .
          </div>
        ) : loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
            Loading…
          </div>
        ) : !run ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
            Run not found.
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-base font-semibold text-slate-900">
                {run.route_area} • {run.route_day} • {String(run.route_slot || "ANY").toUpperCase()}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-slate-700">{run.run_date}</span>
                <span className="mx-2 text-slate-300">•</span>
                <span className="font-medium text-slate-700">{vehicleLabel}</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-600">Stops</div>
                  <div className="text-lg font-semibold text-slate-900">{totals.totalStops}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-600">Extra bags</div>
                  <div className="text-lg font-semibold text-slate-900">{totals.totalExtraBags}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-600">One-off bookings</div>
                  <div className="text-lg font-semibold text-slate-900">{totals.totalBookings || 0}</div>
                  <div className="text-xs text-slate-500">{totals.totalCompletedBookings || 0} completed</div>
                </div>
              </div>
            </div>

            {/* ONE-OFF BOOKINGS */}
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-base font-semibold text-slate-900">One-off bookings</div>
              <div className="mt-1 text-sm text-slate-600">Jobs due for this run.</div>

              {bookings.length === 0 ? (
                <div className="mt-3 text-sm text-slate-700">No one-off bookings for this run.</div>
              ) : (
                <div className="mt-3 space-y-2">
                  {bookings.map((b, idx) => {
                    const completed = !!b.completed_at;
                    const isSaving = savingKey === `booking:${b.id}`;
                    return (
                      <div key={b.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-base font-semibold text-slate-900">
                              {idx + 1}. {b.booking_ref || "Booking"}
                              {completed ? (
                                <span className="ml-2 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                                  completed
                                </span>
                              ) : (
                                <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                                  due
                                </span>
                              )}
                            </div>

                            {b.name ? (
                              <div className="mt-1 text-sm text-slate-900">
                                Customer: <span className="font-semibold">{b.name}</span>
                              </div>
                            ) : null}

                            <div className="mt-1 text-sm text-slate-700">{b.address}</div>

                            <div className="mt-1 text-sm text-slate-600">
                              {b.postcode}
                              <span className="mx-2 text-slate-300">•</span>
                              {moneyGBP(b.total_pence)}
                              <span className="mx-2 text-slate-300">•</span>
                              Slot:{" "}
                              <span className="font-semibold text-slate-800">
                                {String(b.route_slot || "ANY").toUpperCase()}
                              </span>
                            </div>

                            {Array.isArray(b.items) && b.items.length ? (
                              <div className="mt-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                                <div className="text-xs font-semibold text-slate-700">Items to collect</div>
                                <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                                  {b.items.map((it, i) => (
                                    <li key={i}>
                                      {it.title}
                                      {Number(it.qty) > 1 ? <span className="text-slate-600"> ×{it.qty}</span> : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : b.items_summary ? (
                              <div className="mt-1 text-xs text-slate-600">Items: {b.items_summary}</div>
                            ) : null}

                            {b.notes ? (
                              <div className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                                <div className="text-xs font-semibold">Notes / access</div>
                                <div className="mt-1 whitespace-pre-wrap">{b.notes}</div>
                              </div>
                            ) : null}

                            <div className="mt-2 text-sm text-slate-700">
                              {b.phone ? (
                                <>
                                  Phone: <span className="font-semibold">{b.phone}</span>
                                </>
                              ) : (
                                <span className="text-slate-500">No phone</span>
                              )}
                              {b.email ? (
                                <>
                                  <span className="mx-2 text-slate-300">•</span>
                                  Email: <span className="font-semibold">{b.email}</span>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <div className="shrink-0 flex gap-2">
                            {completed ? (
                              <button
                                type="button"
                                onClick={() => setBookingCompleted(b.id, false)}
                                disabled={isSaving}
                                className={cx(
                                  "rounded-xl px-3 py-2 text-sm font-semibold ring-1",
                                  isSaving
                                    ? "bg-slate-200 text-slate-500 ring-slate-200"
                                    : "bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100"
                                )}
                              >
                                Undo
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setBookingCompleted(b.id, true)}
                                disabled={isSaving}
                                className={cx(
                                  "rounded-xl px-3 py-2 text-sm font-semibold ring-1",
                                  isSaving
                                    ? "bg-slate-200 text-slate-500 ring-slate-200"
                                    : "bg-emerald-600 text-white ring-emerald-700 hover:bg-emerald-700"
                                )}
                              >
                                Completed
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SUBSCRIPTION STOPS */}
            {stops.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
                No subscription stops due for this run.
              </div>
            ) : (
              <div className="space-y-2 pb-10">
                {stops.map((s) => (
                  <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
                            disabled={savingKey === s.id}
                            className={cx(
                              "rounded-xl px-3 py-2 text-sm font-semibold ring-1",
                              savingKey === s.id
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
                            disabled={savingKey === s.id}
                            className={cx(
                              "rounded-xl px-3 py-2 text-sm font-semibold ring-1",
                              savingKey === s.id
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
