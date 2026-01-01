// pages/ops/dashboard.js
import { useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

function isoDate(d) {
  // d is Date
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // Sun=0..Sat=6
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isPausedOn(sub, yyyyMmDd) {
  // pause_from / pause_to are expected as YYYY-MM-DD or null
  if (!sub) return false;
  const from = sub.pause_from;
  const to = sub.pause_to;

  if (!from && !to) return false;
  if (from && !to) return yyyyMmDd >= from;
  if (!from && to) return yyyyMmDd <= to;
  return yyyyMmDd >= from && yyyyMmDd <= to;
}

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

export default function OpsDashboard(props) {
  const {
    today,
    todayName,
    thisWeekDays, // [{date,label,dayName}]
    overviewByArea, // [{route_area, route_day, due_count, paused_count}]
    weekPlanner, // { [date]: { [area]: count } }
    areas, // [{route_area, route_day}]
    alerts,
    vehicles,
    staff,
  } = props;

  const [createOpen, setCreateOpen] = useState(false);
  const [createArea, setCreateArea] = useState(null); // {route_area, route_day}
  const [vehicleId, setVehicleId] = useState("");
  const [staffIds, setStaffIds] = useState([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const staffByRole = useMemo(() => {
    const drivers = [];
    const others = [];
    for (const s of staff || []) {
      // role is optional; fall back to "driver" assumption if name contains driver? (no)
      if ((s.role || "").toLowerCase().includes("driver")) drivers.push(s);
      else others.push(s);
    }
    return { drivers, others };
  }, [staff]);

  function openCreate(areaObj) {
    setCreateError("");
    setVehicleId("");
    setStaffIds([]);
    setCreateArea(areaObj);
    setCreateOpen(true);
  }

  function toggleStaff(id) {
    setStaffIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function tryCreateDailyRun(payload) {
    // Robust: try common endpoints in order (whichever you already have).
    const candidates = [
      "/api/ops/daily-runs", // POST (common REST style)
      "/api/ops/daily-runs/create", // POST
      "/api/ops/create-daily-run", // POST
    ];

    let lastErr = null;

    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.status === 404) continue; // try next candidate

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          lastErr = new Error(data?.error || `Create run failed (${res.status})`);
          continue;
        }

        // Expected: { id } or { run: { id } }
        const id = data?.id || data?.run?.id;
        if (!id) {
          lastErr = new Error("Create run succeeded but no run id returned.");
          continue;
        }

        return { id };
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error("No create-run API route found.");
  }

  async function onCreateRun() {
    setCreateError("");

    if (!createArea?.route_area) {
      setCreateError("Missing route area.");
      return;
    }
    if (!createArea?.route_day) {
      setCreateError("Missing route day for this area.");
      return;
    }
    if (!vehicleId) {
      setCreateError("Select a vehicle.");
      return;
    }
    if (!staffIds.length) {
      setCreateError("Select at least one staff member.");
      return;
    }

    setCreating(true);
    try {
      const payload = {
        run_date: today,
        route_area: createArea.route_area,
        route_day: createArea.route_day,
        vehicle_id: vehicleId,
        staff_ids: staffIds,
      };

      const { id } = await tryCreateDailyRun(payload);

      // Go straight to run view
      window.location.href = `/ops/run/${id}`;
    } catch (e) {
      setCreateError(e?.message || "Failed to create run.");
      setCreating(false);
    }
  }

  const navLinks = [
    { href: "/ops/subscribers", title: "Subscribers", desc: "Status, routes, next dates" },
    { href: "/ops/today", title: "Today List", desc: "Due today + mark collected" },
    { href: "/ops/daily-runs", title: "Daily Runs", desc: "Plan runs + assign staff/vehicle" },
    { href: "/ops/staff", title: "Staff", desc: "Drivers & crew" },
    { href: "/ops/vehicles", title: "Vehicles", desc: "Vans, capacity, notes" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Ops Dashboard</h1>
            <p className="text-sm text-gray-600">
              {todayName} • {today}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/driver/login"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Driver portal
            </Link>
            <Link
              href="/ops/today"
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
            >
              Open Today List
            </Link>
          </div>
        </div>

        {/* Quick nav */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {navLinks.map((x) => (
            <Link
              key={x.href}
              href={x.href}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300"
            >
              <div className="text-sm font-semibold text-gray-900">{x.title}</div>
              <div className="mt-1 text-xs text-gray-600">{x.desc}</div>
            </Link>
          ))}
        </div>

        {/* Today overview + Alerts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Today overview</h2>
                <p className="text-xs text-gray-600">Grouped by route area (due today)</p>
              </div>
              <Link
                href="/ops/today"
                className="text-sm font-medium text-gray-900 underline decoration-gray-300 hover:decoration-gray-900"
              >
                View full list
              </Link>
            </div>

            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Route area</th>
                    <th className="px-3 py-2 text-left">Route day</th>
                    <th className="px-3 py-2 text-right">Due</th>
                    <th className="px-3 py-2 text-right">Paused</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {overviewByArea.length ? (
                    overviewByArea.map((row) => (
                      <tr key={`${row.route_area}-${row.route_day}`} className="bg-white">
                        <td className="px-3 py-2 font-medium text-gray-900">
                          {row.route_area || "Unassigned"}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{row.route_day || "-"}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">
                          {row.due_count}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {row.paused_count}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/ops/today?area=${encodeURIComponent(
                                row.route_area || ""
                              )}`}
                              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50"
                            >
                              Open
                            </Link>
                            <button
                              type="button"
                              onClick={() =>
                                openCreate({
                                  route_area: row.route_area,
                                  route_day: row.route_day,
                                })
                              }
                              className={classNames(
                                "rounded-lg px-2.5 py-1.5 text-xs font-semibold",
                                row.due_count > 0
                                  ? "bg-gray-900 text-white hover:bg-black"
                                  : "bg-gray-200 text-gray-600 cursor-not-allowed"
                              )}
                              disabled={row.due_count <= 0}
                              title={
                                row.due_count > 0
                                  ? "Create a run for today for this area"
                                  : "No stops due today"
                              }
                            >
                              Create run
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-4 text-center text-sm text-gray-600" colSpan={5}>
                        No routes found for today.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              Tip: “Create run” is only enabled when there are stops due today for that route
              area.
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Ops alerts</h2>
            <p className="text-xs text-gray-600">Quick sanity checks</p>

            <div className="mt-3 space-y-2">
              <AlertRow
                label="Overdue collections"
                value={alerts.overdue_active}
                href="/ops/subscribers?filter=overdue"
              />
              <AlertRow
                label="Pending (not active)"
                value={alerts.pending}
                href="/ops/subscribers?filter=pending"
              />
              <AlertRow
                label="Missing route_day / route_area"
                value={alerts.missing_route}
                href="/ops/subscribers?filter=missing_route"
              />
              <AlertRow
                label="Paused right now"
                value={alerts.paused_now}
                href="/ops/subscribers?filter=paused"
              />
            </div>

            <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
              <div className="font-semibold text-gray-900">Driver portal</div>
              <div className="mt-1">
                Drivers sign in here to view assigned runs and mark collections.
              </div>
              <Link
                href="/driver/login"
                className="mt-2 inline-block font-medium text-gray-900 underline decoration-gray-300 hover:decoration-gray-900"
              >
                /driver/login
              </Link>
            </div>
          </div>
        </div>

        {/* Week planner */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">This week planner (Mon–Fri)</h2>
              <p className="text-xs text-gray-600">Counts by route area based on next_collection_date</p>
            </div>
            <Link
              href="/ops/daily-runs"
              className="text-sm font-medium text-gray-900 underline decoration-gray-300 hover:decoration-gray-900"
            >
              Plan runs
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Area</th>
                  {thisWeekDays.map((d) => (
                    <th key={d.date} className="px-3 py-2 text-center">
                      <div className="font-semibold text-gray-700">{d.dayName}</div>
                      <div className="font-normal">{d.label}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {areas.length ? (
                  areas.map((a) => (
                    <tr key={`${a.route_area}-${a.route_day}`} className="bg-white">
                      <td className="px-3 py-2 font-medium text-gray-900">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div>{a.route_area || "Unassigned"}</div>
                            <div className="text-xs font-normal text-gray-600">
                              {a.route_day || "-"}
                            </div>
                          </div>
                          <Link
                            href={`/ops/subscribers?area=${encodeURIComponent(a.route_area || "")}`}
                            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50"
                          >
                            Subscribers
                          </Link>
                        </div>
                      </td>

                      {thisWeekDays.map((d) => {
                        const n = weekPlanner?.[d.date]?.[a.route_area || ""] || 0;
                        return (
                          <td key={`${a.route_area}-${d.date}`} className="px-3 py-2 text-center">
                            <div
                              className={classNames(
                                "inline-flex min-w-[44px] items-center justify-center rounded-lg px-2 py-1 font-semibold",
                                n > 0 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
                              )}
                            >
                              {n}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-4 text-center text-sm text-gray-600" colSpan={6}>
                      No route areas configured yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            This is intentionally simple: it reflects whatever is currently in{" "}
            <span className="font-mono">subscriptions.next_collection_date</span>.
          </div>
        </div>
      </div>

      {/* Create run modal */}
      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Create daily run</div>
                  <div className="mt-1 text-xs text-gray-600">
                    {todayName} • {today}
                  </div>
                  <div className="mt-2 text-sm text-gray-900">
                    Area:{" "}
                    <span className="font-semibold">{createArea?.route_area || "-"}</span>{" "}
                    <span className="text-gray-500">({createArea?.route_day || "-"})</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Vehicle</label>
                  <select
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="">Select vehicle…</option>
                    {(vehicles || []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name || v.reg || v.id}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-gray-500">
                    Uses your existing vehicles table.
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700">Staff</label>
                  <div className="mt-1 max-h-44 overflow-auto rounded-lg border border-gray-300 bg-white p-2">
                    {(staff || []).length ? (
                      <div className="space-y-1">
                        {(staffByRole.drivers.length ? staffByRole.drivers : staff).map((s) => (
                          <label
                            key={s.id}
                            className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1 hover:bg-gray-50"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={staffIds.includes(s.id)}
                                onChange={() => toggleStaff(s.id)}
                              />
                              <span className="text-sm text-gray-900">
                                {s.name || s.email || s.id}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">{s.role || ""}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600">No staff found.</div>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Picks from staff table. (If roles exist, drivers show first.)
                  </div>
                </div>
              </div>

              {createError ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {createError}
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onCreateRun}
                  className={classNames(
                    "rounded-lg px-4 py-2 text-sm font-semibold",
                    creating ? "bg-gray-400 text-white" : "bg-gray-900 text-white hover:bg-black"
                  )}
                  disabled={creating}
                >
                  {creating ? "Creating…" : "Create run"}
                </button>
              </div>

              <div className="mt-3 text-xs text-gray-500">
                This will create a run for today and then send you straight to the run page.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AlertRow({ label, value, href }) {
  const val = Number(value || 0);
  const isHot = val > 0;
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
      <div className="text-sm font-medium text-gray-900">{label}</div>
      <div className="flex items-center gap-3">
        <div
          className={classNames(
            "rounded-lg px-2 py-1 text-sm font-semibold",
            isHot ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
          )}
        >
          {val}
        </div>
        <Link
          href={href}
          className="text-sm font-medium text-gray-900 underline decoration-gray-300 hover:decoration-gray-900"
        >
          View
        </Link>
      </div>
    </div>
  );
}

export async function getServerSideProps() {
  const supabase = getSupabaseAdmin();

  const now = new Date();
  const today = isoDate(now);

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayName = dayNames[now.getDay()];

  const monday = startOfWeekMonday(now);
  const friday = addDays(monday, 4);

  const mondayIso = isoDate(monday);
  const fridayIso = isoDate(friday);

  // Pull minimal fields needed to compute today overview + alerts + planner.
  const { data: subs, error: subsErr } = await supabase
    .from("subscriptions")
    .select(
      "id,status,route_day,route_area,next_collection_date,pause_from,pause_to"
    )
    .gte("next_collection_date", mondayIso)
    .lte("next_collection_date", fridayIso);

  // Also fetch "today slice" for accurate paused/due counts & overdue/pending/missing_route checks.
  const { data: subsAllForAlerts, error: subsAllErr } = await supabase
    .from("subscriptions")
    .select(
      "id,status,route_day,route_area,next_collection_date,pause_from,pause_to"
    );

  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id,name,reg,capacity_units,active")
    .order("name", { ascending: true });

  const { data: staff } = await supabase
    .from("staff")
    .select("id,name,email,role,active")
    .order("name", { ascending: true });

  if (subsErr || subsAllErr) {
    // Keep it production-safe: show dashboard with empty data rather than throwing
    // (so Basic Auth isn't masking a 500 during ops).
    return {
      props: {
        today,
        todayName,
        thisWeekDays: buildWeekDays(monday),
        overviewByArea: [],
        weekPlanner: {},
        areas: [],
        alerts: { overdue_active: 0, pending: 0, missing_route: 0, paused_now: 0 },
        vehicles: vehicles || [],
        staff: staff || [],
        _error: subsErr?.message || subsAllErr?.message || "Failed to load subscriptions",
      },
    };
  }

  const weekSubs = subs || [];
  const allSubs = subsAllForAlerts || [];

  // Compute alerts
  let overdue_active = 0;
  let pending = 0;
  let missing_route = 0;
  let paused_now = 0;

  for (const s of allSubs) {
    const paused = isPausedOn(s, today);
    if (paused) paused_now += 1;

    const isActive = String(s.status || "").toLowerCase() === "active";
    const isPending = String(s.status || "").toLowerCase() === "pending";
    if (isPending) pending += 1;

    if (!s.route_day || !s.route_area) missing_route += 1;

    if (isActive && !paused && s.next_collection_date && s.next_collection_date < today) {
      overdue_active += 1;
    }
  }

  // Today overview grouped by route_area (only those due today)
  const todayMap = new Map(); // key = route_area||"" + "|" + route_day||""
  for (const s of allSubs) {
    if (!s.next_collection_date || s.next_collection_date !== today) continue;

    const key = `${s.route_area || ""}|${s.route_day || ""}`;
    if (!todayMap.has(key)) {
      todayMap.set(key, {
        route_area: s.route_area || "",
        route_day: s.route_day || "",
        due_count: 0,
        paused_count: 0,
      });
    }
    const row = todayMap.get(key);

    const paused = isPausedOn(s, today);
    const isActive = String(s.status || "").toLowerCase() === "active";
    if (paused) row.paused_count += 1;
    if (isActive && !paused) row.due_count += 1;
  }

  const overviewByArea = Array.from(todayMap.values()).sort((a, b) => {
    // Put named areas first, alphabetical
    const aa = a.route_area || "";
    const bb = b.route_area || "";
    if (!aa && bb) return 1;
    if (aa && !bb) return -1;
    return aa.localeCompare(bb);
  });

  // Week planner: counts by date+area for ACTIVE and not paused on that day
  const weekPlanner = {}; // date -> area -> count
  const areaKeySet = new Set(); // build list of areas
  for (const s of weekSubs) {
    const date = s.next_collection_date;
    if (!date) continue;

    const isActive = String(s.status || "").toLowerCase() === "active";
    if (!isActive) continue;

    if (isPausedOn(s, date)) continue;

    const area = s.route_area || "";
    const day = s.route_day || "";
    areaKeySet.add(`${area}|${day}`);

    if (!weekPlanner[date]) weekPlanner[date] = {};
    weekPlanner[date][area] = (weekPlanner[date][area] || 0) + 1;
  }

  // Areas list: include areas seen in week data + today overview (so the table stays useful)
  for (const row of overviewByArea) {
    areaKeySet.add(`${row.route_area || ""}|${row.route_day || ""}`);
  }

  const areas = Array.from(areaKeySet)
    .map((k) => {
      const [route_area, route_day] = k.split("|");
      return { route_area, route_day };
    })
    .sort((a, b) => {
      const aa = a.route_area || "";
      const bb = b.route_area || "";
      if (!aa && bb) return 1;
      if (aa && !bb) return -1;
      return aa.localeCompare(bb);
    });

  return {
    props: {
      today,
      todayName,
      thisWeekDays: buildWeekDays(monday),
      overviewByArea,
      weekPlanner,
      areas,
      alerts: { overdue_active, pending, missing_route, paused_now },
      vehicles: (vehicles || []).filter((v) => v.active !== false),
      staff: (staff || []).filter((s) => s.active !== false),
    },
  };
}

function buildWeekDays(mondayDate) {
  const d0 = new Date(mondayDate);
  const dayNamesShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const out = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(d0);
    d.setDate(d.getDate() + i);
    const date = isoDate(d);
    const dayName = dayNamesShort[d.getDay()];
    const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    out.push({ date, dayName, label });
  }
  return out;
}
