// pages/ops/daily-runs.js
import { useMemo, useState } from "react";
import Link from "next/link";

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SLOTS = ["ANY", "AM", "PM"];

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

function londonTodayYMD() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

async function apiJSON(url, opts) {
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Request failed");
  return json;
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const k = String(x || "");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export default function OpsDailyRuns({ initialRuns, initialRouteAreas }) {
  const [runs, setRuns] = useState(initialRuns || []);
  const [routeAreas, setRouteAreas] = useState(initialRouteAreas || []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Form state
  const [runDate, setRunDate] = useState(londonTodayYMD());
  const [routeDay, setRouteDay] = useState("Monday");
  const [routeArea, setRouteArea] = useState("");
  const [routeSlot, setRouteSlot] = useState("ANY");

  const areasForDay = useMemo(() => {
    // Build list of unique area names available for selected day
    const filtered = (routeAreas || []).filter(
      (r) => (r.active !== false) && r.route_day === routeDay
    );
    const names = uniq(filtered.map((r) => r.name)).sort((a, b) => a.localeCompare(b));
    return names;
  }, [routeAreas, routeDay]);

  const slotsForSelectedAreaDay = useMemo(() => {
    // For clarity: show which slots exist in route_areas for (day + area)
    const filtered = (routeAreas || []).filter(
      (r) =>
        (r.active !== false) &&
        r.route_day === routeDay &&
        r.name === routeArea
    );
    const slots = uniq(filtered.map((r) => (r.slot || "ANY"))).sort((a, b) => {
      const ai = SLOTS.indexOf(a);
      const bi = SLOTS.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return slots.length ? slots : ["ANY"];
  }, [routeAreas, routeDay, routeArea]);

  // When day changes, reset area to first available
  useMemo(() => {
    if (!areasForDay.length) {
      setRouteArea("");
      return;
    }
    if (!routeArea || !areasForDay.includes(routeArea)) {
      setRouteArea(areasForDay[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDay, areasForDay.join("|")]);

  // When area changes, nudge slot to a valid one for that area/day
  useMemo(() => {
    if (!routeArea) return;
    if (!slotsForSelectedAreaDay.includes(routeSlot)) {
      setRouteSlot(slotsForSelectedAreaDay[0] || "ANY");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeArea, routeDay, slotsForSelectedAreaDay.join("|")]);

  const runsSorted = useMemo(() => {
    const copy = [...(runs || [])];
    copy.sort((a, b) => {
      const ad = String(a.run_date || "").localeCompare(String(b.run_date || ""));
      if (ad !== 0) return ad;
      const day = String(a.route_day || "").localeCompare(String(b.route_day || ""));
      if (day !== 0) return day;
      const area = String(a.route_area || "").localeCompare(String(b.route_area || ""));
      if (area !== 0) return area;
      return String(a.route_slot || "").localeCompare(String(b.route_slot || ""));
    });
    return copy;
  }, [runs]);

  async function refresh() {
    setError("");
    setBusy(true);
    try {
      const [r1, r2] = await Promise.all([
        apiJSON("/api/ops/daily-runs"),
        apiJSON("/api/ops/route-areas"),
      ]);
      setRuns(r1.data || []);
      setRouteAreas(r2.data || []);
    } catch (e) {
      setError(e?.message || "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function createRunSingle() {
    setError("");

    if (!runDate) return setError("Pick a run date.");
    if (!ALL_DAYS.includes(routeDay)) return setError("Pick a valid route day.");
    if (!routeArea) return setError("Pick a route area (from the dropdown).");
    if (!SLOTS.includes(routeSlot)) return setError("Pick a valid slot.");

    setBusy(true);
    try {
      await apiJSON("/api/ops/daily-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_date: runDate,
          route_day: routeDay,
          route_area: routeArea,
          route_slot: routeSlot,
        }),
      });

      await refresh();
    } catch (e) {
      setError(e?.message || "Create failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createRunsForDay() {
    // Create one run per distinct (area + slot) for selected day, based on route_areas.
    setError("");

    if (!runDate) return setError("Pick a run date.");
    if (!ALL_DAYS.includes(routeDay)) return setError("Pick a valid route day.");

    const entries = (routeAreas || []).filter(
      (r) => (r.active !== false) && r.route_day === routeDay && r.name
    );

    if (!entries.length) {
      return setError(`No active route areas exist for ${routeDay}. Add them in /ops/routes first.`);
    }

    // Unique combos
    const combos = [];
    const seen = new Set();
    for (const r of entries) {
      const area = String(r.name || "").trim();
      const slot = (r.slot || "ANY").toString().trim() || "ANY";
      const key = `${area}|${slot}`;
      if (!area || seen.has(key)) continue;
      seen.add(key);
      combos.push({ area, slot });
    }

    setBusy(true);
    try {
      for (const c of combos) {
        await apiJSON("/api/ops/daily-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            run_date: runDate,
            route_day: routeDay,
            route_area: c.area,
            route_slot: c.slot,
          }),
        });
      }
      await refresh();
    } catch (e) {
      setError(e?.message || "Bulk create failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Daily runs</h1>
            <p className="text-sm text-gray-600">
              A <span className="font-semibold">run</span> is one van route for a specific date + area (+ slot).
              If you have two vans on Monday (e.g. Porthcawl + Swansea), that’s{" "}
              <span className="font-semibold">two runs</span>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/ops/dashboard"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Back to dashboard
            </Link>

            <button
              type="button"
              onClick={refresh}
              disabled={busy}
              className={cx(
                "rounded-lg border px-3 py-2 text-sm font-medium",
                busy
                  ? "border-gray-200 bg-gray-100 text-gray-500"
                  : "border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
              )}
            >
              {busy ? "Working…" : "Refresh"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {/* Create run */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-gray-900">Create run</div>
          <div className="text-xs text-gray-600 mb-4">
            Route areas come from <span className="font-mono">route_areas</span> (set in /ops/routes). No typing.
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700">Run date</label>
              <input
                type="date"
                value={runDate}
                onChange={(e) => setRunDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700">Route day</label>
              <select
                value={routeDay}
                onChange={(e) => setRouteDay(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                {ALL_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700">Route area</label>
              <select
                value={routeArea}
                onChange={(e) => setRouteArea(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                {areasForDay.length ? (
                  areasForDay.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))
                ) : (
                  <option value="">No areas for this day</option>
                )}
              </select>
              {!areasForDay.length ? (
                <div className="mt-1 text-xs text-amber-700">
                  No active route areas exist for {routeDay}. Add them in /ops/routes first.
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700">Slot</label>
              <select
                value={routeSlot}
                onChange={(e) => setRouteSlot(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                {slotsForSelectedAreaDay.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {routeArea ? (
                <div className="mt-1 text-xs text-gray-500">
                  Slots available for {routeArea} on {routeDay}:{" "}
                  <span className="font-semibold">{slotsForSelectedAreaDay.join(", ")}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-gray-600">
              Tip: use <span className="font-semibold">“Create runs for this day”</span> to set up all vans for that day
              based on /ops/routes.
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={createRunsForDay}
                disabled={busy}
                className={cx(
                  "rounded-lg border px-3 py-2 text-sm font-semibold",
                  busy
                    ? "border-gray-200 bg-gray-100 text-gray-500"
                    : "border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
                )}
              >
                Create runs for {routeDay}
              </button>

              <button
                type="button"
                onClick={createRunSingle}
                disabled={busy || !areasForDay.length}
                className={cx(
                  "rounded-lg px-4 py-2 text-sm font-semibold",
                  busy || !areasForDay.length
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "bg-gray-900 text-white hover:bg-black"
                )}
              >
                Create this run
              </button>
            </div>
          </div>
        </div>

        {/* Runs list */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Existing runs</h2>
              <p className="text-xs text-gray-600">
                Click a run to view stops and mark collections.
              </p>
            </div>
            <div className="text-xs text-gray-500">Runs: {runsSorted.length}</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Day</th>
                  <th className="px-3 py-2 text-left">Area</th>
                  <th className="px-3 py-2 text-left">Slot</th>
                  <th className="px-3 py-2 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {runsSorted.length ? (
                  runsSorted.map((r) => (
                    <tr key={r.id} className="bg-white">
                      <td className="px-3 py-2 text-gray-900 font-medium">{r.run_date}</td>
                      <td className="px-3 py-2 text-gray-700">{r.route_day}</td>
                      <td className="px-3 py-2 text-gray-700">{r.route_area}</td>
                      <td className="px-3 py-2 text-gray-700">{r.route_slot || "ANY"}</td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/ops/run/${r.id}`}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-8 text-center text-sm text-gray-600" colSpan={5}>
                      No runs yet. Create one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            If a run exists but has no stops, it usually means the run filters don’t match subscriber data
            (date/area/slot). This UI reduces that risk by selecting areas from /ops/routes.
          </div>
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps(ctx) {
  const proto = (ctx.req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = ctx.req.headers["x-forwarded-host"] || ctx.req.headers.host;
  const baseUrl = `${proto}://${host}`;

  try {
    const [runsRes, routesRes] = await Promise.all([
      fetch(`${baseUrl}/api/ops/daily-runs`, {
        headers: {
          authorization: ctx.req.headers.authorization || "",
          cookie: ctx.req.headers.cookie || "",
        },
      }),
      fetch(`${baseUrl}/api/ops/route-areas`, {
        headers: {
          authorization: ctx.req.headers.authorization || "",
          cookie: ctx.req.headers.cookie || "",
        },
      }),
    ]);

    const runsJson = await runsRes.json().catch(() => ({}));
    const routesJson = await routesRes.json().catch(() => ({}));

    return {
      props: {
        initialRuns: runsRes.ok ? runsJson.data || [] : [],
        initialRouteAreas: routesRes.ok ? routesJson.data || [] : [],
      },
    };
  } catch (e) {
    return {
      props: {
        initialRuns: [],
        initialRouteAreas: [],
      },
    };
  }
}
