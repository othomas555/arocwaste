import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function moneyGBP(pence) {
  const n = Number(pence);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n / 100);
}

async function readJsonOrText(res) {
  const ct = String(res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();
  if (ct.includes("application/json")) {
    try {
      return { ok: true, json: JSON.parse(text), raw: text };
    } catch {
      return { ok: false, json: null, raw: text };
    }
  }
  try {
    return { ok: true, json: JSON.parse(text), raw: text };
  } catch {
    return { ok: false, json: null, raw: text };
  }
}

export default function OpsRunViewPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [run, setRun] = useState(null);
  const [stops, setStops] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [totals, setTotals] = useState({
    totalStops: 0,
    totalExtraBags: 0,
    totalBookings: 0,
    totalCompletedBookings: 0,
  });

  // staff assignment UI
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [allStaff, setAllStaff] = useState([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState([]);
  const [savingStaff, setSavingStaff] = useState(false);
  const [staffSavedMsg, setStaffSavedMsg] = useState("");

  // route ordering UI (Google)
  const [origin, setOrigin] = useState("");
  const [optLoading, setOptLoading] = useState(false);
  const [optMsg, setOptMsg] = useState("");
  const [optErr, setOptErr] = useState("");

  async function load() {
    if (!id) return;
    setLoading(true);
    setError("");
    setWarning("");

    try {
      const res = await fetch(`/api/ops/run/${id}`);
      const parsed = await readJsonOrText(res);

      if (!res.ok) {
        const msg =
          parsed?.json?.error ||
          `Run API failed (${res.status}). ${parsed.ok ? "" : "Non-JSON response from server."}`;
        const snippet = parsed?.raw ? String(parsed.raw).slice(0, 200) : "";
        throw new Error(`${msg}${snippet ? `\n\nResponse starts:\n${snippet}` : ""}`);
      }

      const data = parsed.json || {};
      setRun(data.run || null);
      setStops(Array.isArray(data.stops) ? data.stops : []);
      setBookings(Array.isArray(data.bookings) ? data.bookings : []);
      setTotals(
        data.totals || {
          totalStops: 0,
          totalExtraBags: 0,
          totalBookings: 0,
          totalCompletedBookings: 0,
        }
      );
      if (data.warning) setWarning(data.warning);

      // preselect assigned staff from run payload (daily_run_staff join)
      const assigned = Array.isArray(data.run?.daily_run_staff)
        ? data.run.daily_run_staff.map((x) => x.staff_id).filter(Boolean)
        : [];
      setSelectedStaffIds(assigned);
    } catch (e) {
      setRun(null);
      setStops([]);
      setBookings([]);
      setTotals({
        totalStops: 0,
        totalExtraBags: 0,
        totalBookings: 0,
        totalCompletedBookings: 0,
      });
      setError(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadStaff() {
    setStaffError("");
    setStaffSavedMsg("");
    setStaffLoading(true);
    try {
      const res = await fetch("/api/ops/staff/list");
      const parsed = await readJsonOrText(res);
      if (!res.ok) throw new Error(parsed?.json?.error || "Failed to load staff");
      setAllStaff(Array.isArray(parsed.json?.staff) ? parsed.json.staff : []);
    } catch (e) {
      setAllStaff([]);
      setStaffError(e?.message || "Failed to load staff");
    } finally {
      setStaffLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (id) loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Persist origin locally so ops only types once (optional)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const k = "aroc_ops_route_origin";
      const v = window.localStorage.getItem(k) || "";
      if (v && !origin) setOrigin(v);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("aroc_ops_route_origin", String(origin || ""));
    } catch {
      // ignore
    }
  }, [origin]);

  const staffNames = useMemo(() => {
    if (!run?.daily_run_staff) return "";
    const names = run.daily_run_staff.map((x) => x.staff?.name).filter(Boolean);
    return names.join(", ");
  }, [run]);

  const vehicleLabel = useMemo(() => {
    if (!run?.vehicles) return "— no vehicle —";
    const v = run.vehicles;
    return `${v.registration}${v.name ? ` • ${v.name}` : ""}`;
  }, [run]);

  const slotLabel = useMemo(() => String(run?.route_slot || "ANY").toUpperCase(), [run]);

  function toggleStaff(staffId) {
    setStaffSavedMsg("");
    setSelectedStaffIds((prev) => {
      const set = new Set(prev);
      if (set.has(staffId)) set.delete(staffId);
      else set.add(staffId);
      return Array.from(set);
    });
  }

  async function saveStaffAssignments() {
    if (!run?.id) return;
    setStaffError("");
    setStaffSavedMsg("");
    setSavingStaff(true);
    try {
      const res = await fetch(`/api/ops/run/${run.id}/assign-staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_ids: selectedStaffIds }),
      });
      const parsed = await readJsonOrText(res);
      if (!res.ok) throw new Error(parsed?.json?.error || "Failed to save assignments");

      setStaffSavedMsg("Saved.");
      await load();
    } catch (e) {
      setStaffError(e?.message || "Failed to save assignments");
    } finally {
      setSavingStaff(false);
    }
  }

  async function markCollected(subscription_id) {
    setSavingId(subscription_id);
    setError("");
    try {
      const res = await fetch("/api/ops/mark-collected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id, collection_date: run?.run_date }),
      });
      const parsed = await readJsonOrText(res);
      if (!res.ok) throw new Error(parsed?.json?.error || "Failed to mark collected");
      await load();
    } catch (e) {
      setError(e?.message || "Failed");
    } finally {
      setSavingId("");
    }
  }

  async function undoCollected(subscription_id) {
    setSavingId(subscription_id);
    setError("");
    try {
      const res = await fetch("/api/ops/undo-collected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id, collection_date: run?.run_date }),
      });
      const parsed = await readJsonOrText(res);
      if (!res.ok) throw new Error(parsed?.json?.error || "Failed to undo");
      await load();
    } catch (e) {
      setError(e?.message || "Failed");
    } finally {
      setSavingId("");
    }
  }

  async function setBookingCompleted(booking_id, completed) {
    if (!run?.id) return;
    setSavingId(`booking:${booking_id}`);
    setError("");
    try {
      const res = await fetch("/api/ops/bookings/set-completed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id, completed, run_id: String(run.id) }),
      });
      const parsed = await readJsonOrText(res);
      if (!res.ok) throw new Error(parsed?.json?.error || "Failed to update booking");
      await load();
    } catch (e) {
      setError(e?.message || "Failed");
    } finally {
      setSavingId("");
    }
  }

  async function optimizeOrder() {
    if (!run?.id) return;
    setOptErr("");
    setOptMsg("");
    setOptLoading(true);
    try {
      // ✅ origin is OPTIONAL now (one-click). If blank, API uses first+last stop as anchors.
      const o = String(origin || "").trim();

      const res = await fetch(`/api/ops/run/${run.id}/optimize-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(o ? { origin: o } : {}),
      });

      const parsed = await readJsonOrText(res);
      if (!res.ok) throw new Error(parsed?.json?.error || "Failed to optimize order");

      const truncated = !!parsed?.json?.truncated;
      setOptMsg(truncated ? "Order saved (truncated due to Google waypoint limit)." : "Order saved.");
      await load();
    } catch (e) {
      setOptErr(e?.message || "Failed to optimize order");
    } finally {
      setOptLoading(false);
    }
  }

  const completedStops = useMemo(() => stops.filter((s) => !!s.collected).length, [stops]);

  // For visual numbering across bookings + subscriptions (in their current order)
  const bookingOrderIndex = useMemo(() => {
    const m = new Map();
    (bookings || []).forEach((b, i) => m.set(String(b.id), i + 1));
    return m;
  }, [bookings]);

  const subOrderIndex = useMemo(() => {
    const offset = (bookings || []).length;
    const m = new Map();
    (stops || []).forEach((s, i) => m.set(String(s.id), offset + i + 1));
    return m;
  }, [bookings, stops]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-3 py-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Ops • Run</h1>
            <p className="text-sm text-slate-600">Stops due for this run’s date + area + day + slot.</p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/ops/daily-runs"
              className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm"
            >
              Day Planner
            </Link>
            <Link
              href="/ops/today"
              className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm"
            >
              Today
            </Link>
          </div>
        </div>

        {error ? (
          <div className="mb-3 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {warning ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {warning}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm text-slate-600">Loading run…</div>
          </div>
        ) : !run ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm text-slate-700">Run not found.</div>
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="text-base font-semibold text-slate-900">
                {run.route_area} • {run.route_day} • {slotLabel}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-slate-700">{run.run_date}</span>
                <span className="mx-2 text-slate-300">•</span>
                <span className="font-medium text-slate-700">{vehicleLabel}</span>
                <span className="mx-2 text-slate-300">•</span>
                <span>{staffNames || "No staff assigned"}</span>
              </div>

              {/* ROUTE ORDERING (GOOGLE) */}
              <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Route ordering (Google)</div>
                    <div className="mt-1 text-xs text-slate-600">
                      One click saves an optimized stop_order to this run. Drivers will see the same order.
                      <span className="block mt-1">
                        Optional: enter a depot/origin address (with postcode) to optimize as a round-trip from the yard.
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={optimizeOrder}
                    disabled={optLoading}
                    className={cx(
                      "rounded-lg px-4 py-2 text-sm font-semibold",
                      optLoading ? "bg-slate-300 text-slate-600" : "bg-slate-900 text-white hover:bg-black"
                    )}
                  >
                    {optLoading ? "Optimizing…" : "Optimise order"}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Optional: Origin / depot address
                    </label>
                    <input
                      value={origin}
                      onChange={(e) => {
                        setOptErr("");
                        setOptMsg("");
                        setOrigin(e.target.value);
                      }}
                      placeholder="e.g. Cox Skips & Waste Management, Newport, NPxx xxx"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                    <div className="mt-1 text-xs text-slate-500">
                      Leave blank for one-click (first + last stop used as anchors). Google has a waypoint limit (~23).
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-700">Status</div>
                    {optErr ? (
                      <div className="mt-1 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                        {optErr}
                      </div>
                    ) : optMsg ? (
                      <div className="mt-1 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                        {optMsg}
                      </div>
                    ) : (
                      <div className="mt-1 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600">
                        Not run yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ASSIGNMENT */}
              <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Assign driver / team</div>
                    <div className="mt-1 text-xs text-slate-600">
                      Tick staff members who should see this run in the driver portal.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={loadStaff}
                    disabled={staffLoading}
                    className={cx(
                      "rounded-lg border px-3 py-2 text-sm font-semibold",
                      staffLoading
                        ? "border-slate-200 bg-slate-100 text-slate-500"
                        : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                    )}
                  >
                    {staffLoading ? "Refreshing…" : "Refresh staff"}
                  </button>
                </div>

                {staffError ? (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {staffError}
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(allStaff || []).map((s) => {
                    const checked = selectedStaffIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={cx(
                          "flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1",
                          checked ? "ring-emerald-200" : "ring-slate-200"
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{s.name}</div>
                          <div className="truncate text-xs text-slate-600">
                            {s.role || "staff"} • {s.email || "no email"}
                          </div>
                        </div>

                        <input type="checkbox" checked={checked} onChange={() => toggleStaff(s.id)} />
                      </label>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  {staffSavedMsg ? <div className="text-sm text-emerald-700">{staffSavedMsg}</div> : null}
                  <button
                    type="button"
                    onClick={saveStaffAssignments}
                    disabled={savingStaff}
                    className={cx(
                      "rounded-lg px-4 py-2 text-sm font-semibold",
                      savingStaff ? "bg-slate-300 text-slate-600" : "bg-slate-900 text-white hover:bg-black"
                    )}
                  >
                    {savingStaff ? "Saving…" : "Save assignments"}
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-600">Stops</div>
                  <div className="text-lg font-semibold text-slate-900">{totals.totalStops}</div>
                  <div className="text-xs text-slate-500">{completedStops} collected</div>
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

              <div className="mt-3 text-xs text-slate-500">
                Slot matching: AM includes AM + ANY + blank. PM includes PM + ANY + blank. ANY includes all.
              </div>

              {run.notes ? <div className="mt-3 text-sm text-slate-600">{run.notes}</div> : null}
            </div>

            {/* ONE-OFF BOOKINGS */}
            <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-slate-900">One-off bookings</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Bookings matching this run’s date + area + day + slot.
                  </div>
                </div>
              </div>

              {bookings.length === 0 ? (
                <div className="mt-3 text-sm text-slate-700">No one-off bookings match this run.</div>
              ) : (
                <div className="mt-3 space-y-2">
                  {bookings.map((b) => {
                    const isSaving = savingId === `booking:${b.id}`;
                    const completed = !!b.completed_at;
                    const idx = bookingOrderIndex.get(String(b.id)) || 0;
                    return (
                      <div key={b.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-base font-semibold text-slate-900">
                              {idx ? <span className="mr-2 text-slate-500">#{idx}</span> : null}
                              {b.booking_ref || "Booking"}
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

                            <div className="mt-1 text-sm text-slate-700">{b.address}</div>

                            <div className="mt-1 text-sm text-slate-600">
                              {b.postcode}
                              <span className="mx-2 text-slate-300">•</span>
                              Slot:{" "}
                              <span className="font-semibold text-slate-800">
                                {String(b.route_slot || "ANY").toUpperCase()}
                              </span>
                              <span className="mx-2 text-slate-300">•</span>
                              {moneyGBP(b.total_pence)}
                              {b.payment_status ? (
                                <>
                                  <span className="mx-2 text-slate-300">•</span>
                                  <span className="capitalize">{String(b.payment_status)}</span>
                                </>
                              ) : null}
                            </div>

                            {b.items_summary ? (
                              <div className="mt-1 text-xs text-slate-600">Items: {b.items_summary}</div>
                            ) : null}

                            {b.notes ? <div className="mt-1 text-xs text-slate-600">Notes: {b.notes}</div> : null}

                            <div className="mt-1 text-xs text-slate-600">
                              {b.phone ? (
                                <>
                                  Phone: <span className="font-semibold text-slate-800">{b.phone}</span>
                                </>
                              ) : (
                                <span className="text-slate-500">No phone</span>
                              )}
                            </div>

                            {completed && b.completed_by_run_id ? (
                              <div className="mt-1 text-xs text-slate-500">
                                Completed for run: <span className="font-semibold">{b.completed_by_run_id}</span>
                              </div>
                            ) : null}
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
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div className="text-sm text-slate-700">No due stops match this run.</div>
              </div>
            ) : (
              <div className="space-y-2 pb-10">
                {stops.map((s) => {
                  const idx = subOrderIndex.get(String(s.id)) || 0;
                  return (
                    <div key={s.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-base font-semibold text-slate-900">
                            {idx ? <span className="mr-2 text-slate-500">#{idx}</span> : null}
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
                            Slot:{" "}
                            <span className="font-semibold text-slate-800">
                              {String(s.route_slot || "ANY").toUpperCase()}
                            </span>
                            <span className="mx-2 text-slate-300">•</span>
                            Extra bags:{" "}
                            <span className="font-semibold text-slate-800">{Number(s.extra_bags) || 0}</span>
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
