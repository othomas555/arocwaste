import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
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

/** ---------- Offline queue (localStorage) ---------- **/
const QUEUE_KEY = "aroc_driver_action_queue_v1";

function safeParseJSON(s, fallback) {
  try {
    return JSON.parse(String(s || ""));
  } catch {
    return fallback;
  }
}

function loadQueue() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const arr = safeParseJSON(raw, []);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveQueue(q) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(Array.isArray(q) ? q : []));
  } catch {
    // ignore
  }
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function actionKeyFor(a) {
  // Used for pending UI: "sub:<id>" or "book:<id>"
  if (a?.kind === "sub_mark" || a?.kind === "sub_undo") return `sub:${a.subscription_id}`;
  if (a?.kind === "book_set") return `book:${a.booking_id}`;
  return "";
}

function dedupeKeyFor(a) {
  // If driver taps twice before sync, keep only the latest per stop.
  // E.g. sub_mark then sub_undo -> keep the latest
  if (a?.kind === "sub_mark" || a?.kind === "sub_undo") return `sub:${a.subscription_id}`;
  if (a?.kind === "book_set") return `book:${a.booking_id}`;
  return "";
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
    // optional (won't break if missing)
    totalQuoteVisits: 0,
    totalCompletedQuoteVisits: 0,
  });

  // Pending UI: { "sub:123": true, "book:abc": true }
  const [pendingMap, setPendingMap] = useState({});
  const pendingMapRef = useRef({});
  useEffect(() => {
    pendingMapRef.current = pendingMap;
  }, [pendingMap]);

  const processingRef = useRef(false);

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
          totalQuoteVisits: 0,
          totalCompletedQuoteVisits: 0,
        }
      );
    } catch (e) {
      setError(e?.message || "Load failed");
      setRun(null);
      setItems([]);
      setTotals({
        totalStops: 0,
        totalExtraBags: 0,
        totalBookings: 0,
        totalCompletedBookings: 0,
        totalQuoteVisits: 0,
        totalCompletedQuoteVisits: 0,
      });
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

  /** ---------- Quote-visit detector ---------- **/
  function isQuoteVisit(item) {
    if (item?.type !== "booking") return false;
    const bt = String(item?.booking_type || "").trim().toLowerCase();
    if (bt === "quote_visit") return true;
    if (item?.requires_visit === true) return true;
    return false;
  }

  /** ---------- Optimistic state helpers ---------- **/
  function setStopOptimistic({ kind, subscription_id, booking_id, completed }) {
    setItems((prev) => {
      const next = (prev || []).map((it) => {
        if (kind === "sub_mark" && it.type === "subscription" && String(it.id) === String(subscription_id)) {
          return { ...it, collected: true };
        }
        if (kind === "sub_undo" && it.type === "subscription" && String(it.id) === String(subscription_id)) {
          return { ...it, collected: false };
        }
        if (kind === "book_set" && it.type === "booking" && String(it.id) === String(booking_id)) {
          return { ...it, completed_at: completed ? new Date().toISOString() : null };
        }
        return it;
      });
      return next;
    });

    // Update totals only for bookings completion count (subscriptions totals are “due”, not “completed”)
    if (kind === "book_set") {
      setTotals((t) => {
        const current = Number(t?.totalCompletedBookings) || 0;
        const wasCompleted = items.find((x) => x.type === "booking" && String(x.id) === String(booking_id))?.completed_at
          ? true
          : false;

        let next = current;
        if (completed && !wasCompleted) next = current + 1;
        if (!completed && wasCompleted) next = Math.max(0, current - 1);

        return { ...(t || {}), totalCompletedBookings: next };
      });
    }
  }

  function markPending(key, on) {
    if (!key) return;
    setPendingMap((prev) => {
      const next = { ...(prev || {}) };
      if (on) next[key] = true;
      else delete next[key];
      return next;
    });
  }

  function rebuildPendingFromQueue() {
    const q = loadQueue();
    const m = {};
    for (const a of q) {
      const k = actionKeyFor(a);
      if (k) m[k] = true;
    }
    setPendingMap(m);
  }

  /** ---------- Queue + processor ---------- **/
  function enqueueAction(action) {
    const a = { id: uid(), ts: Date.now(), attempt: 0, last_error: "", ...(action || {}) };
    const dk = dedupeKeyFor(a);

    const q = loadQueue();
    const filtered = dk ? q.filter((x) => dedupeKeyFor(x) !== dk) : q;
    const next = [...filtered, a];
    saveQueue(next);

    // Mark pending UI
    const pk = actionKeyFor(a);
    if (pk) markPending(pk, true);
  }

  async function performAction(a) {
    const token = session?.access_token;
    if (!token) throw new Error("Not logged in.");

    if (a.kind === "sub_mark") {
      const res = await fetch("/api/driver/mark-collected", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          run_id: a.run_id,
          subscription_id: a.subscription_id,
          collected_date: a.collected_date,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to mark collected");
      return true;
    }

    if (a.kind === "sub_undo") {
      const res = await fetch("/api/driver/undo-collected", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          run_id: a.run_id,
          subscription_id: a.subscription_id,
          collected_date: a.collected_date,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to undo");
      return true;
    }

    if (a.kind === "book_set") {
      const res = await fetch("/api/driver/bookings/set-completed", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          run_id: a.run_id,
          booking_id: a.booking_id,
          completed: !!a.completed,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to update booking");
      return true;
    }

    throw new Error("Unknown action");
  }

  async function processQueueOnce() {
    if (processingRef.current) return;
    if (!session?.access_token) return;
    processingRef.current = true;

    try {
      let q = loadQueue();
      if (!q.length) {
        if (Object.keys(pendingMapRef.current || {}).length) rebuildPendingFromQueue();
        return;
      }

      const nextQ = [];
      let changed = false;

      for (const a of q) {
        if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) {
          nextQ.push(a);
          continue;
        }

        try {
          await performAction(a);
          changed = true;

          const pk = actionKeyFor(a);
          if (pk) markPending(pk, false);
        } catch (e) {
          const msg = e?.message || "Failed";
          const attempt = Number(a.attempt) || 0;

          const updated = {
            ...a,
            attempt: attempt + 1,
            last_error: msg,
            last_ts: Date.now(),
          };

          nextQ.push(updated);
          changed = true;

          setError((prev) => {
            const base = prev ? `${prev}\n` : "";
            return `${base}Some actions are still syncing: ${msg}`;
          });
        }
      }

      const compact = nextQ.filter(Boolean);
      if (changed) saveQueue(compact);

      if (!compact.length) {
        await load();
      }
    } finally {
      processingRef.current = false;
    }
  }

  // Build pending map at start + on login
  useEffect(() => {
    if (!session?.access_token) return;
    rebuildPendingFromQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  // Retry loop: every 8 seconds + on coming online
  useEffect(() => {
    if (!session?.access_token) return;

    const t = setInterval(() => {
      const q = loadQueue();
      if (q.length) processQueueOnce();
    }, 8000);

    function onOnline() {
      processQueueOnce();
    }

    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
    }

    return () => {
      clearInterval(t);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, run?.id]);

  /** ---------- Existing actions, now queued + optimistic ---------- **/
  function isCompleted(item) {
    const isBooking = item?.type === "booking";
    return isBooking ? !!item?.completed_at : !!item?.collected;
  }

  function isPending(item) {
    const k = item?.type === "booking" ? `book:${item.id}` : `sub:${item.id}`;
    return !!pendingMap?.[k];
  }

  function cardTone(item) {
    const booking = item?.type === "booking";
    const done = isCompleted(item);
    const quote = isQuoteVisit(item);

    if (done) return "bg-white border-slate-200";
    if (booking && quote) return "bg-purple-50 border-purple-200";
    if (booking) return "bg-blue-50 border-blue-200";
    return "bg-red-50 border-red-200";
  }

  function typePill(item) {
    const booking = item?.type === "booking";
    const done = isCompleted(item);
    const quote = isQuoteVisit(item);

    if (done) return "bg-slate-100 text-slate-700 ring-slate-200";
    if (booking && quote) return "bg-purple-100 text-purple-900 ring-purple-200";
    if (booking) return "bg-blue-100 text-blue-900 ring-blue-200";
    return "bg-red-100 text-red-900 ring-red-200";
  }

  function statusPill(item) {
    const booking = item?.type === "booking";
    const done = isCompleted(item);
    const pending = isPending(item);

    if (pending) return "bg-violet-600 text-white ring-violet-700";
    if (done) return "bg-slate-100 text-slate-700 ring-slate-200";
    if (booking) return "bg-blue-600 text-white ring-blue-700";
    return "bg-emerald-600 text-white ring-emerald-700";
  }

  function statusLabel(item) {
    const done = isCompleted(item);
    const pending = isPending(item);
    if (pending) return "SYNCING";
    return done ? "COMPLETED" : "DUE";
  }

  function stopTitle(item) {
    const addr = cleanText(item?.address);
    const pc = cleanText(item?.postcode);
    if (!addr && !pc) return "Stop";
    if (addr && pc) return `${addr} • ${pc}`;
    return addr || pc;
  }

  function stopJobLine(item) {
    const booking = item?.type === "booking";
    const quote = isQuoteVisit(item);

    if (booking) {
      if (quote) return "Site visit for quote (visit required)";
      const desc = cleanText(item?.description);
      return desc || "One-off collection";
    }

    const extra = Number(item?.extra_bags) || 0;
    const own = item?.use_own_bin ? "Own bin" : "Company bin";
    if (extra > 0) return `Empty wheelie bin (+ ${extra} extra bag${extra === 1 ? "" : "s"}) • ${own}`;
    return `Empty wheelie bin • ${own}`;
  }

  async function markCollected(subscription_id) {
    setError("");
    if (!run?.id || !run?.run_date) {
      setError("Run missing run_date/run_id");
      return;
    }

    setStopOptimistic({ kind: "sub_mark", subscription_id });

    enqueueAction({
      kind: "sub_mark",
      run_id: run.id,
      subscription_id: String(subscription_id),
      collected_date: String(run.run_date),
    });

    processQueueOnce();
  }

  async function undoCollected(subscription_id) {
    setError("");
    if (!run?.id || !run?.run_date) {
      setError("Run missing run_date/run_id");
      return;
    }

    setStopOptimistic({ kind: "sub_undo", subscription_id });

    enqueueAction({
      kind: "sub_undo",
      run_id: run.id,
      subscription_id: String(subscription_id),
      collected_date: String(run.run_date),
    });

    processQueueOnce();
  }

  async function setBookingCompleted(booking_id, completed) {
    setError("");
    if (!run?.id) {
      setError("Run missing run_id");
      return;
    }

    setStopOptimistic({ kind: "book_set", booking_id, completed: !!completed });

    enqueueAction({
      kind: "book_set",
      run_id: run.id,
      booking_id: String(booking_id),
      completed: !!completed,
    });

    processQueueOnce();
  }

  // optional: quote counts (safe if not present)
  const quoteCount = useMemo(() => {
    if (Number(totals?.totalQuoteVisits) > 0) return Number(totals.totalQuoteVisits);
    return (items || []).filter((x) => isQuoteVisit(x)).length;
  }, [items, totals]);

  const quoteCompletedCount = useMemo(() => {
    if (Number(totals?.totalCompletedQuoteVisits) > 0) return Number(totals.totalCompletedQuoteVisits);
    return (items || []).filter((x) => isQuoteVisit(x) && !!x.completed_at).length;
  }, [items, totals]);

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
          <div className="mb-4 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
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

              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
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
                <div className="rounded-xl bg-purple-50 p-3 ring-1 ring-purple-200">
                  <div className="text-xs font-semibold text-purple-700">Quote visits</div>
                  <div className="text-lg font-semibold text-slate-900">{quoteCount || 0}</div>
                  <div className="text-xs text-purple-800">{quoteCompletedCount || 0} completed</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-600">Total stops</div>
                  <div className="text-lg font-semibold text-slate-900">{(items || []).length}</div>
                </div>
              </div>

              {/* Sync status */}
              <div className="mt-3 text-xs text-slate-600">
                {typeof navigator !== "undefined" && navigator && navigator.onLine === false ? (
                  <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-900 ring-1 ring-amber-200">
                    Offline — actions will sync when signal returns
                  </span>
                ) : Object.keys(pendingMap || {}).length ? (
                  <span className="rounded-full bg-violet-100 px-2 py-1 font-semibold text-violet-900 ring-1 ring-violet-200">
                    Syncing {Object.keys(pendingMap || {}).length} change{Object.keys(pendingMap || {}).length === 1 ? "" : "s"}…
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-200">
                    Up to date
                  </span>
                )}
              </div>
            </div>

            {/* LEGEND */}
            <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-base font-semibold text-slate-900">Run sheet</div>
              <div className="mt-1 text-sm text-slate-600">
                Red = wheelie bin collections. Blue = one-off jobs. Purple = quote visits. Completed stops turn grey. SYNCING means it’s queued.
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
                  const pending = isPending(it);
                  const quote = isQuoteVisit(it);
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
                              {booking ? (quote ? "QUOTE VISIT" : "ONE-OFF") : "WHEELIE BIN"}
                            </span>

                            <span className={cx("rounded-full px-2 py-1 text-[11px] font-semibold ring-1", statusPill(it))}>
                              {statusLabel(it)}
                            </span>

                            {booking && it.booking_ref ? (
                              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                                {it.booking_ref}
                              </span>
                            ) : null}

                            {pending ? (
                              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                                queued
                              </span>
                            ) : null}
                          </div>

                          {/* headline */}
                          <div className="mt-2 text-base font-semibold text-slate-900">{headline}</div>

                          {/* job line */}
                          <div className="mt-1 text-sm text-slate-800">
                            <span className="font-semibold">Job:</span> {jobLine}
                            {booking && it.total_pence != null && !quote ? (
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

                              {quote ? (
                                <div className="mt-2 text-xs font-semibold text-purple-900">
                                  Visit required — take photos + notes, quote will be raised after.
                                </div>
                              ) : null}
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
                                  "bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100"
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
                                  "bg-slate-900 text-white ring-slate-900 hover:bg-black"
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
                                "bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100"
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
                                "bg-emerald-600 text-white ring-emerald-700 hover:bg-emerald-700"
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
