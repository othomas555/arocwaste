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

function cleanText(s) {
  return String(s || "").trim();
}

export default function DriverRunPage() {
  const router = useRouter();
  const { id } = router.query;

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");

  const [run, setRun] = useState(null);
  const [items, setItems] = useState([]); // merged ordered stops (bookings + subscriptions)
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
      setItems(Array.isArray(json.items) ? json.items : []);
      setTotals(
        json.totals || {
          totalStops: 0,
          totalExtraBags: 0,
          totalBookings: 0,
          totalCompletedBookings: 0,
        }
      );
    } catch (e) {
      setError(e?.message || "Load failed");
      setRun(null);
      setItems([]);
      setTotals({ totalStops: 0, totalExtraBags: 0, totalBookings: 0, totalCompletedBookings: 0 });
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
    setSavingKey(`sub:${subscription_id}`);
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
    setSavingKey(`sub:${subscription_id}`);
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
    setSavingKey(`book:${booking_id}`);
    setError("");
    try {
      const token = session?.access_token;
      if (!token) throw new Error("Not logged in.");

      const res = await fetch("/api/driver/bookings/set-completed", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          run_id: run?.id,
          booking_id,
          completed,
        }),
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

  function isCompleted(item) {
    const isBooking = item?.type === "booking";
    return isBooking ? !!item?.completed_at : !!item?.collected;
  }

  function cardTone(item) {
    const booking = item?.type === "booking";
    const done = isCompleted(item);

    if (done) return "bg-white border-slate-200";
    if (booking) return "bg-blue-50 border-blue-200";
    return "bg-red-50 border-red-200";
  }

  function typePill(item) {
    const booking = item?.type === "booking";
    const done = isCompleted(item);

    if (done) return "bg-slate-100 text-slate-700 ring-slate-200";
    if (booking) return "bg-blue-100 text-blue-900 ring-blue-200";
    return "bg-red-100 text-red-900 ring-red-200";
  }

  function statusPill(item) {
    const booking = item?.type === "booking";
    const done = isCompleted(item);

    if (done) return "bg-slate-100 text-slate-700 ring-slate-200";
    if (booking) return "bg-blue-600 text-white ring-blue-700";
    return "bg-emerald-600 text-white ring-emerald-700";
  }

  function stopTitle(item) {
    // Make address the headline for drivers
    const addr = cleanText(item?.address);
    const pc = cleanText(item?.postcode);
    if (!addr && !pc) return "Stop";
    if (addr && pc) return `${addr} • ${pc}`;
    return addr || pc;
  }

  function stopJobLine(item) {
    const booking = item?.type === "booking";

    if (booking) {
      const desc = cleanText(item?.description);
      return desc || "One-off collection";
    }

    // subscription
    const extra = Number(item?.extra_bags) || 0;
    const own = item?.use_own_bin ? "Own bin" : "Company bin";
    if (extra > 0) return `Empty wheelie bin (+ ${extra} extra bag${extra === 1 ? "" : "s"}) • ${own}`;
    return `Empty wheelie bin • ${own}`;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Driver • Run</h1>
            <p className="text-sm text-slate-600">Work through the stops in order.</p>
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
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">Loading…</div>
        ) : !run ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">Run not found.</div>
        ) : (
          <>
            {/* HEADER */}
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-base font-semibold text-slate-900">
                {run.route_area} • {run.route_day} • {String(run.route_slot || "ANY").toUpperCase()}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-slate-700">{run.run_date}</span>
                <span className="mx-2 text-slate-300">•</span>
                <span className="font-medium text-slate-700">{vehicleLabel}</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-600">Wheelie bins</div>
                  <div className="text-lg font-semibold text-slate-900">{totals.totalStops || 0}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-600">Extra bags</div>
                  <div className="text-lg font-semibold text-slate-900">{totals.totalExtraBags || 0}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-600">One-off jobs</div>
                  <div className="text-lg font-semibold text-slate-900">{totals.totalBookings || 0}</div>
                  <div className="text-xs text-slate-500">{totals.totalCompletedBookings || 0} completed</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-600">Total stops</div>
                  <div className="text-lg font-semibold text-slate-900">{(items || []).length}</div>
                </div>
              </div>
            </div>

            {/* LEGEND */}
            <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-base font-semibold text-slate-900">Run sheet</div>
              <div className="mt-1 text-sm text-slate-600">
                Red = wheelie bin collections. Blue = one-off jobs. Completed stops turn grey.
              </div>
            </div>

            {items.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
                No stops due for this run.
              </div>
            ) : (
              <div className="space-y-2 pb-10">
                {items.map((it, idx) => {
                  const booking = it.type === "booking";
                  const done = isCompleted(it);
                  const key = `${it.type}:${it.id}`;

                  const headline = stopTitle(it);
                  const jobLine = stopJobLine(it);

                  const customer = cleanText(it.customer_name);
                  const phone = cleanText(it.phone);
                  const email = cleanText(it.email);
                  const notes = cleanText(it.notes);
                  const opsNotes = cleanText(it.ops_notes);

                  return (
                    <div key={key} className={cx("rounded-2xl border p-4 shadow-sm", cardTone(it))}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {/* top row */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-slate-500 font-semibold">{idx + 1}.</span>

                            <span className={cx("rounded-full px-2 py-1 text-[11px] font-extrabold tracking-wide ring-1", typePill(it))}>
                              {booking ? "ONE-OFF" : "WHEELIE BIN"}
                            </span>

                            <span className={cx("rounded-full px-2 py-1 text-[11px] font-semibold ring-1", statusPill(it))}>
                              {done ? "COMPLETED" : "DUE"}
                            </span>

                            {booking && it.booking_ref ? (
                              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                                {it.booking_ref}
                              </span>
                            ) : null}
                          </div>

                          {/* headline */}
                          <div className="mt-2 text-base font-semibold text-slate-900">{headline}</div>

                          {/* job line */}
                          <div className="mt-1 text-sm text-slate-800">
                            <span className="font-semibold">Job:</span> {jobLine}
                            {booking && it.total_pence != null ? (
                              <>
                                <span className="mx-2 text-slate-300">•</span>
                                <span className="font-semibold">{moneyGBP(it.total_pence)}</span>
                              </>
                            ) : null}
                          </div>

                          {/* details */}
                          {booking ? (
                            <div className="mt-2 rounded-xl bg-white/60 p-3 ring-1 ring-slate-200">
                              <div className="text-xs text-slate-700">
                                {customer ? (
                                  <>
                                    Customer: <span className="font-semibold">{customer}</span>
                                  </>
                                ) : (
                                  <span className="text-slate-500">No customer name</span>
                                )}

                                {phone ? (
                                  <>
                                    <span className="mx-2 text-slate-300">•</span>
                                    Phone: <span className="font-semibold">{phone}</span>
                                  </>
                                ) : null}

                                {email ? (
                                  <>
                                    <span className="mx-2 text-slate-300">•</span>
                                    Email: <span className="font-semibold">{email}</span>
                                  </>
                                ) : null}
                              </div>

                              {notes ? (
                                <div className="mt-2 text-xs text-slate-700">
                                  Notes: <span className="font-semibold">{notes}</span>
                                </div>
                              ) : (
                                <div className="mt-2 text-xs text-slate-500">No notes</div>
                              )}
                            </div>
                          ) : opsNotes ? (
                            <div className="mt-2 rounded-xl bg-white/60 p-3 ring-1 ring-slate-200">
                              <div className="text-xs text-slate-700">
                                Notes: <span className="font-semibold">{opsNotes}</span>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        {/* buttons */}
                        <div className="shrink-0 flex gap-2">
                          {booking ? (
                            done ? (
                              <button
                                type="button"
                                onClick={() => setBookingCompleted(it.id, false)}
                                disabled={savingKey === `book:${it.id}`}
                                className={cx(
                                  "rounded-xl px-3 py-2 text-sm font-semibold ring-1",
                                  savingKey === `book:${it.id}`
                                    ? "bg-slate-200 text-slate-500 ring-slate-200"
                                    : "bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100"
                                )}
                              >
                                Undo
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setBookingCompleted(it.id, true)}
                                disabled={savingKey === `book:${it.id}`}
                                className={cx(
                                  "rounded-xl px-3 py-2 text-sm font-semibold ring-1",
                                  savingKey === `book:${it.id}`
                                    ? "bg-slate-200 text-slate-500 ring-slate-200"
                                    : "bg-slate-900 text-white ring-slate-900 hover:bg-black"
                                )}
                              >
                                Completed
                              </button>
                            )
                          ) : done ? (
                            <button
                              type="button"
                              onClick={() => undoCollected(it.id)}
                              disabled={savingKey === `sub:${it.id}`}
                              className={cx(
                                "rounded-xl px-3 py-2 text-sm font-semibold ring-1",
                                savingKey === `sub:${it.id}`
                                  ? "bg-slate-200 text-slate-500 ring-slate-200"
                                  : "bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100"
                              )}
                            >
                              Undo
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => markCollected(it.id)}
                              disabled={savingKey === `sub:${it.id}`}
                              className={cx(
                                "rounded-xl px-3 py-2 text-sm font-semibold ring-1",
                                savingKey === `sub:${it.id}`
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
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
