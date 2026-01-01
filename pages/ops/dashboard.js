import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const WEEKDAYS_MON_FRI = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function londonYMD(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function londonWeekday(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
  }).format(date);
}

function addDaysYMD(ymd, days) {
  const [y, m, d] = String(ymd).split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return londonYMD(dt);
}

function safeNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function isActiveLike(status) {
  return status === "active" || status === "trialing";
}

export default function OpsDashboardPage() {
  const today = useMemo(() => londonYMD(new Date()), []);
  const todayName = useMemo(() => londonWeekday(new Date()), []);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [subs, setSubs] = useState([]);
  const [runsToday, setRunsToday] = useState([]);
  const [staff, setStaff] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  // quick-create state
  const [quick, setQuick] = useState({
    open: false,
    route_area: "",
    route_day: todayName,
    vehicle_id: "",
    staff_ids: [],
    notes: "",
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [rSubs, rRuns, rStaff, rVehicles] = await Promise.all([
        fetch("/api/ops/subscribers"),
        fetch(`/api/ops/daily-runs?date=${encodeURIComponent(today)}`),
        fetch("/api/ops/staff"),
        fetch("/api/ops/vehicles"),
      ]);

      const jSubs = await rSubs.json();
      const jRuns = await rRuns.json();
      const jStaff = await rStaff.json();
      const jVehicles = await rVehicles.json();

      if (!rSubs.ok) throw new Error(jSubs?.error || "Failed to load subscribers");
      if (!rRuns.ok) throw new Error(jRuns?.error || "Failed to load daily runs");
      if (!rStaff.ok) throw new Error(jStaff?.error || "Failed to load staff");
      if (!rVehicles.ok) throw new Error(jVehicles?.error || "Failed to load vehicles");

      setSubs(Array.isArray(jSubs?.subscribers) ? jSubs.subscribers : []);
      setRunsToday(Array.isArray(jRuns?.runs) ? jRuns.runs : []);
      setStaff(Array.isArray(jStaff?.staff) ? jStaff.staff : []);
      setVehicles(Array.isArray(jVehicles?.vehicles) ? jVehicles.vehicles : []);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeStaff = useMemo(() => staff.filter((s) => s.active), [staff]);
  const activeVehicles = useMemo(() => vehicles.filter((v) => v.active), [vehicles]);

  // ---------- TODAY OVERVIEW ----------
  const todayDue = useMemo(() => {
    return subs
      .filter((s) => isActiveLike(s.status))
      .filter((s) => String(s.next_collection_date || "") === today);
  }, [subs, today]);

  const todayTotals = useMemo(() => {
    const totalStops = todayDue.length;
    const extraBags = todayDue.reduce((sum, s) => sum + safeNum(s.extra_bags), 0);
    return { totalStops, extraBags };
  }, [todayDue]);

  const todayByArea = useMemo(() => {
    const map = new Map();
    for (const s of todayDue) {
      const area = (s.route_area || "Unassigned area").toString().trim() || "Unassigned area";
      const cur = map.get(area) || { area, stops: 0, extraBags: 0 };
      cur.stops += 1;
      cur.extraBags += safeNum(s.extra_bags);
      map.set(area, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.stops - a.stops);
  }, [todayDue]);

  // ---------- THIS WEEK PLANNER (Mon–Fri ahead) ----------
  const weekDates = useMemo(() => {
    const out = [];
    for (let i = 0; i < 10; i++) {
      const d = addDaysYMD(today, i);
      const name = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        weekday: "long",
      }).format(new Date(d + "T00:00:00Z"));
      if (WEEKDAYS_MON_FRI.includes(name)) out.push({ ymd: d, weekday: name });
      if (out.length === 5) break;
    }
    return out;
  }, [today]);

  const weekPlanner = useMemo(() => {
    const active = subs.filter((s) => isActiveLike(s.status));
    return weekDates.map(({ ymd, weekday }) => {
      const due = active.filter((s) => String(s.next_collection_date || "") === ymd);

      const byRouteDay = new Map();
      for (const s of due) {
        const rd = (s.route_day || "Missing route_day").toString().trim() || "Missing route_day";
        const cur = byRouteDay.get(rd) || { route_day: rd, stops: 0 };
        cur.stops += 1;
        byRouteDay.set(rd, cur);
      }

      return {
        ymd,
        weekday,
        totalStops: due.length,
        groups: Array.from(byRouteDay.values()).sort((a, b) => b.stops - a.stops),
      };
    });
  }, [subs, weekDates]);

  // ---------- OPS ALERTS ----------
  const alerts = useMemo(() => {
    const active = subs.filter((s) => isActiveLike(s.status));
    const missingRouteDay = active.filter((s) => !(s.route_day || "").toString().trim());
    const missingNextDate = active.filter((s) => !(s.next_collection_date || "").toString().trim());
    const missingArea = active.filter((s) => !(s.route_area || "").toString().trim());
    return { missingRouteDay, missingNextDate, missingArea };
  }, [subs]);

  // ---------- RUNS TODAY ----------
  const runsTodayCards = useMemo(() => {
    return (runsToday || [])
      .slice()
      .sort((a, b) => String(a.route_area || "").localeCompare(String(b.route_area || "")))
      .map((r) => {
        const staffNames = Array.isArray(r.daily_run_staff)
          ? r.daily_run_staff.map((x) => x.staff?.name).filter(Boolean).join(", ")
          : "";
        const vehicleLabel = r.vehicles
          ? `${r.vehicles.registration}${r.vehicles.name ? ` • ${r.vehicles.name}` : ""}`
          : "— no vehicle —";
        return {
          id: r.id,
          route_area: r.route_area,
          route_day: r.route_day,
          vehicleLabel,
          staffNames,
          notes: r.notes || "",
        };
      });
  }, [runsToday]);

  const runKeysToday = useMemo(() => {
    // prevent accidental duplicate runs per date/area/day
    const set = new Set();
    for (const r of runsToday || []) {
      set.add(`${r.route_area}||${r.route_day}`);
    }
    return set;
  }, [runsToday]);

  function toggleStaff(list, staffId) {
    const set = new Set(list);
    if (set.has(staffId)) set.delete(staffId);
    else set.add(staffId);
    return Array.from(set);
  }

  function openQuickCreate(area, routeDay) {
    setQuick((q) => ({
      ...q,
      open: true,
      route_area: area,
      route_day: routeDay || todayName,
      vehicle_id: "",
      staff_ids: [],
      notes: "",
    }));
  }

  async function createRunQuick() {
    setBusy(true);
    setError("");
    try {
      const payload = {
        run_date: today,
        route_day: (quick.route_day || "").toString().trim(),
        route_area: (quick.route_area || "").toString().trim(),
        vehicle_id: quick.vehicle_id || null,
        notes: quick.notes || "",
        staff_ids: Array.isArray(quick.staff_ids) ? quick.staff_ids : [],
      };

      if (!payload.route_day) throw new Error("route_day is required");
      if (!payload.route_area) throw new Error("route_area is required");

      const dupKey = `${payload.route_area}||${payload.route_day}`;
      if (runKeysToday.has(dupKey)) {
        throw new Error("A run for this area/day already exists today.");
      }

      const res = await fetch("/api/ops/daily-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Create run failed");

      setQuick((q) => ({ ...q, open: false }));
      await load();
    } catch (e) {
      setError(e.message || "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-3 py-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Ops • Dashboard</h1>
            <p className="text-sm text-slate-600">
              {todayName} • {today}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/ops/subscribers" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              Subscribers
            </Link>
            <Link href="/ops/today" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              Today list
            </Link>
            <Link href="/ops/daily-runs" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              Daily runs
            </Link>
            <Link href="/ops/staff" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              Staff
            </Link>
            <Link href="/ops/vehicles" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              Vehicles
            </Link>

            {/* NEW */}
            <Link href="/driver/login" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              Driver portal
            </Link>

            <button
              type="button"
              onClick={load}
              className="rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-900"
            >
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        {/* KPI cards */}
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-semibold text-slate-600">Today stops</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{loading ? "…" : todayTotals.totalStops}</div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-semibold text-slate-600">Today extra bags</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{loading ? "…" : todayTotals.extraBags}</div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-semibold text-slate-600">Ops alerts</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {loading ? "…" : alerts.missingRouteDay.length + alerts.missingNextDate.length}
            </div>
            <div className="mt-1 text-xs text-slate-500">active/trialing missing route_day or next_collection_date</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Today overview + quick create */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">Today overview</div>
              <Link href="/ops/today" className="text-sm font-semibold text-slate-900 underline">
                Open today list
              </Link>
            </div>

            {loading ? (
              <div className="text-sm text-slate-600">Loading…</div>
            ) : todayByArea.length === 0 ? (
              <div className="text-sm text-slate-700">No due stops today.</div>
            ) : (
              <div className="space-y-2">
                {todayByArea.map((g) => {
                  const canCreate = g.area !== "Unassigned area";
                  return (
                    <div key={g.area} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">{g.area}</div>
                          <div className="text-xs text-slate-600">
                            Stops: <span className="font-semibold text-slate-800">{g.stops}</span>
                            <span className="mx-2 text-slate-300">•</span>
                            Extra bags: <span className="font-semibold text-slate-800">{g.extraBags}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={!canCreate}
                          onClick={() => openQuickCreate(g.area, todayName)}
                          className={cx(
                            "shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ring-1",
                            !canCreate
                              ? "bg-slate-200 text-slate-500 ring-slate-200"
                              : "bg-white text-slate-900 ring-slate-300 hover:bg-slate-100"
                          )}
                          title={!canCreate ? "Assign route_area first" : "Create a run for this area"}
                        >
                          Create run
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Today's runs */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">Today’s runs</div>
              <Link href="/ops/daily-runs" className="text-sm font-semibold text-slate-900 underline">
                Manage runs
              </Link>
            </div>

            {loading ? (
              <div className="text-sm text-slate-600">Loading…</div>
            ) : runsTodayCards.length === 0 ? (
              <div className="text-sm text-slate-700">No runs created for today yet.</div>
            ) : (
              <div className="space-y-2">
                {runsTodayCards.map((r) => (
                  <Link
                    key={r.id}
                    href={`/ops/run/${r.id}`}
                    className="block rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 hover:bg-slate-100"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">
                          {r.route_area} • {r.route_day}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {r.vehicleLabel}
                          <span className="mx-2 text-slate-300">•</span>
                          {r.staffNames || "No staff assigned"}
                        </div>
                        {r.notes ? <div className="mt-1 text-xs text-slate-500">{r.notes}</div> : null}
                      </div>
                      <div className="shrink-0 text-sm font-semibold text-slate-700">Open</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Week planner */}
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-2 text-sm font-semibold text-slate-900">This week planner (Mon–Fri)</div>

          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              {weekPlanner.map((d) => (
                <div key={d.ymd} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-600">{d.weekday}</div>
                  <div className="text-xs text-slate-500">{d.ymd}</div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">{d.totalStops}</div>
                  <div className="mt-2 space-y-1">
                    {d.groups.length === 0 ? (
                      <div className="text-xs text-slate-500">No due stops</div>
                    ) : (
                      d.groups.slice(0, 4).map((g) => (
                        <div key={g.route_day} className="flex items-center justify-between text-xs text-slate-700">
                          <span className="truncate">{g.route_day}</span>
                          <span className="font-semibold">{g.stops}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-2 text-sm font-semibold text-slate-900">Ops alerts</div>

          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="text-xs font-semibold text-slate-600">Active missing route_day</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{alerts.missingRouteDay.length}</div>
                <div className="mt-2 text-xs text-slate-600">
                  Fix in <Link className="font-semibold underline" href="/ops/subscribers">Subscribers</Link>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="text-xs font-semibold text-slate-600">Active missing next_collection_date</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{alerts.missingNextDate.length}</div>
                <div className="mt-2 text-xs text-slate-600">
                  Fix in <Link className="font-semibold underline" href="/ops/subscribers">Subscribers</Link>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="text-xs font-semibold text-slate-600">Active missing route_area</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{alerts.missingArea.length}</div>
                <div className="mt-2 text-xs text-slate-600">
                  Fix in <Link className="font-semibold underline" href="/ops/subscribers">Subscribers</Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick create drawer */}
        {quick.open ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              className="absolute inset-0 bg-black/30"
              onClick={() => setQuick((q) => ({ ...q, open: false }))}
              aria-label="Close"
            />
            <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl rounded-t-3xl bg-white p-4 shadow-2xl ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-slate-900">Create today’s run</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {today} • {quick.route_area}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQuick((q) => ({ ...q, open: false }))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Route day</label>
                  <input
                    value={quick.route_day}
                    onChange={(e) => setQuick((q) => ({ ...q, route_day: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <div className="mt-1 text-xs text-slate-500">Usually matches today ({todayName}).</div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600">Vehicle</label>
                  <select
                    value={quick.vehicle_id}
                    onChange={(e) => setQuick((q) => ({ ...q, vehicle_id: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">— none —</option>
                    {activeVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.registration}{v.name ? ` • ${v.name}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600">Notes</label>
                  <input
                    value={quick.notes}
                    onChange={(e) => setQuick((q) => ({ ...q, notes: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="text-xs font-semibold text-slate-600">Staff</label>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {activeStaff.map((s) => {
                      const checked = quick.staff_ids.includes(s.id);
                      return (
                        <label key={s.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setQuick((q) => ({ ...q, staff_ids: toggleStaff(q.staff_ids, s.id) }))
                            }
                          />
                          <span className="font-semibold text-slate-900">{s.name}</span>
                          <span className="ml-auto text-xs text-slate-500">{s.role}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={createRunQuick}
                  disabled={busy}
                  className={cx(
                    "rounded-xl px-4 py-3 text-sm font-semibold shadow-sm ring-1",
                    busy
                      ? "bg-slate-200 text-slate-500 ring-slate-200"
                      : "bg-black text-white ring-black hover:bg-slate-900"
                  )}
                >
                  {busy ? "Creating…" : "Create run"}
                </button>

                <button
                  type="button"
                  onClick={() => setQuick((q) => ({ ...q, open: false }))}
                  className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 pb-10 text-xs text-slate-500">
          Tip: Create runs from the left panel, then open them from the right.
        </div>
      </div>
    </div>
  );
}
