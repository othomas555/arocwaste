// pages/ops/daily-runs.js
import { useMemo, useState } from "react";
import Link from "next/link";

const SLOT_ORDER = { AM: 1, PM: 2, ANY: 3 };

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

function weekdayFromYMD(ymd) {
  const [Y, M, D] = String(ymd).split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(Y, M - 1, D, 12, 0, 0));
  const idx = dt.getUTCDay();
  const map = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return map[idx];
}

async function apiJSON(url, opts) {
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Request failed");
  return json;
}

export default function OpsDailyRuns({ initialRouteAreas }) {
  const [routeAreas, setRouteAreas] = useState(initialRouteAreas || []);
  const [runDate, setRunDate] = useState(londonTodayYMD());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Total due keyed by "area|slot"
  const [dueCounts, setDueCounts] = useState({});

  // Breakdown keyed by "area|slot"
  const [breakdown, setBreakdown] = useState({
    subscriptions: {},
    bookings: {},
    quotes: {},
  });

  const routeDay = useMemo(() => weekdayFromYMD(runDate), [runDate]);

  const cards = useMemo(() => {
    const active = (routeAreas || []).filter((r) => r.active !== false);
    const todays = active.filter((r) => r.route_day === routeDay);

    // Unique (area, slot) combos
    const map = new Map();
    for (const r of todays) {
      const area = String(r.name || "").trim();
      const slot = String(r.slot || "ANY").trim().toUpperCase() || "ANY";
      if (!area) continue;
      const key = `${area}|${slot}`;
      if (!map.has(key)) map.set(key, { area, slot, route_day: routeDay });
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const aa = String(a.area).localeCompare(String(b.area));
      if (aa !== 0) return aa;
      return (SLOT_ORDER[a.slot] || 99) - (SLOT_ORDER[b.slot] || 99);
    });

    return arr;
  }, [routeAreas, routeDay]);

  async function refreshRoutes() {
    setError("");
    setBusy(true);
    try {
      const r = await apiJSON("/api/ops/route-areas");
      setRouteAreas(r.data || []);
    } catch (e) {
      setError(e?.message || "Failed to refresh route areas");
    } finally {
      setBusy(false);
    }
  }

  async function loadDueCounts() {
    setError("");
    setBusy(true);
    try {
      const r = await apiJSON(`/api/ops/day-summary?date=${encodeURIComponent(runDate)}`);

      // Backward compatible:
      setDueCounts(r?.dueCounts || {});

      // New breakdown (if present)
      const bd = r?.breakdown || null;
      if (bd) {
        setBreakdown({
          subscriptions: bd.subscriptions || {},
          bookings: bd.bookings || {},
          quotes: bd.quotes || {},
        });
      } else {
        setBreakdown({ subscriptions: {}, bookings: {}, quotes: {} });
      }
    } catch (e) {
      setError(e?.message || "Failed to load day summary");
      setDueCounts({});
      setBreakdown({ subscriptions: {}, bookings: {}, quotes: {} });
    } finally {
      setBusy(false);
    }
  }

  async function openRun(area, slot) {
    setError("");
    setBusy(true);
    try {
      const r = await apiJSON("/api/ops/daily-runs/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_date: runDate,
          route_day: routeDay,
          route_area: area,
          route_slot: slot,
        }),
      });

      const runId = r?.run?.id;
      if (!runId) throw new Error("No run id returned");
      window.location.href = `/ops/run/${runId}`;
    } catch (e) {
      setError(e?.message || "Failed to open run");
    } finally {
      setBusy(false);
    }
  }

  function bdCount(map, key) {
    const n = Number(map?.[key] || 0);
    return Number.isFinite(n) ? n : 0;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Day planner</h1>
            <p className="text-sm text-gray-600">
              Pick a date → see the work for that day → open a run → assign driver/team → tick off.
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
              onClick={refreshRoutes}
              disabled={busy}
              className={cx(
                "rounded-lg border px-3 py-2 text-sm font-medium",
                busy
                  ? "border-gray-200 bg-gray-100 text-gray-500"
                  : "border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
              )}
            >
              Refresh routes
            </button>

            <button
              type="button"
              onClick={loadDueCounts}
              disabled={busy}
              className={cx(
                "rounded-lg px-3 py-2 text-sm font-semibold",
                busy ? "bg-gray-300 text-gray-600" : "bg-gray-900 text-white hover:bg-black"
              )}
            >
              Load jobs for {runDate}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700">Date</label>
              <input
                type="date"
                value={runDate}
                onChange={(e) => setRunDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="text-xs font-semibold text-gray-700">Day</div>
              <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                {routeDay}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Areas shown below are pulled from <span className="font-mono">/ops/routes</span> for this day.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.length ? (
            cards.map((c) => {
              const key = `${c.area}|${c.slot}`;
              const total = Number(dueCounts[key] || 0);

              const subN = bdCount(breakdown.subscriptions, key);
              const jobN = bdCount(breakdown.bookings, key);
              const quoteN = bdCount(breakdown.quotes, key);

              const hasBreakdown = subN + jobN + quoteN > 0 || Object.keys(breakdown.subscriptions || {}).length > 0;

              return (
                <div key={key} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{c.area}</div>
                      <div className="mt-1 text-xs text-gray-600">
                        {routeDay} • <span className="font-semibold">{c.slot}</span>
                      </div>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                      <div className="text-xs text-gray-500">Due</div>
                      <div className="text-lg font-semibold text-gray-900">{Number.isFinite(total) ? total : 0}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-gray-500">
                    {hasBreakdown ? (
                      <>
                        Breakdown:{" "}
                        <span className="font-semibold text-gray-700">subs {subN}</span>
                        <span className="mx-1 text-gray-300">•</span>
                        <span className="font-semibold text-gray-700">jobs {jobN}</span>
                        <span className="mx-1 text-gray-300">•</span>
                        <span className="font-semibold text-indigo-700">quotes {quoteN}</span>
                      </>
                    ) : (
                      <>
                        Due count includes <span className="font-semibold">subscriptions + bookings + quote visits</span>{" "}
                        (load jobs to see totals).
                      </>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openRun(c.area, c.slot)}
                      disabled={busy}
                      className={cx(
                        "flex-1 rounded-lg px-3 py-2 text-sm font-semibold",
                        busy ? "bg-gray-300 text-gray-600" : "bg-gray-900 text-white hover:bg-black"
                      )}
                    >
                      Open run
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-sm sm:col-span-2 lg:col-span-3">
              No route areas found for <span className="font-semibold">{routeDay}</span>. Add them in{" "}
              <Link href="/ops/routes" className="underline font-semibold">
                /ops/routes
              </Link>
              .
            </div>
          )}
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
    const routesRes = await fetch(`${baseUrl}/api/ops/route-areas`, {
      headers: {
        authorization: ctx.req.headers.authorization || "",
        cookie: ctx.req.headers.cookie || "",
      },
    });

    const routesJson = await routesRes.json().catch(() => ({}));

    return {
      props: {
        initialRouteAreas: routesRes.ok ? routesJson.data || [] : [],
      },
    };
  } catch (e) {
    return { props: { initialRouteAreas: [] } };
  }
}
