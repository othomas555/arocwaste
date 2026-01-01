import React from "react";
import Link from "next/link";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

/**
 * Ops Dashboard
 * - Today overview (due today): total stops, extra bags, grouped by route_area
 * - This week planner (Mon–Fri): stops per day (by route_day), with route_area breakdown
 * - Ops alerts: active/trialing missing route_day, missing next_collection_date
 *
 * Uses existing logic:
 * - Only status in: active, trialing
 */

// ---------- date helpers (Europe/London) ----------
const LONDON_TZ = "Europe/London";

function londonYMD(date = new Date()) {
  // Returns YYYY-MM-DD in Europe/London
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LONDON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function addDays(ymd, days) {
  // ymd is YYYY-MM-DD, interpret as midnight London, then add days, return YYYY-MM-DD (London)
  // We avoid timezone drift by operating in UTC on a date-only string and re-formatting for London.
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return londonYMD(dt);
}

function mondayOfWeek(ymd) {
  // Get Monday (YYYY-MM-DD) for the week containing ymd, using London day-of-week.
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));

  // Determine day-of-week in London for this date
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TZ,
    weekday: "short",
  }).format(dt); // e.g. "Mon"

  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const offset = map[weekday] ?? 0;
  return addDays(ymd, -offset);
}

function safeInt(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function normStr(s) {
  return (s || "").toString().trim();
}

function groupBy(arr, keyFn) {
  const out = {};
  for (const item of arr) {
    const k = keyFn(item);
    if (!out[k]) out[k] = [];
    out[k].push(item);
  }
  return out;
}

function sortRouteAreas(a, b) {
  // keep blanks last, else alpha
  const aa = normStr(a);
  const bb = normStr(b);
  if (!aa && bb) return 1;
  if (aa && !bb) return -1;
  return aa.localeCompare(bb);
}

const WEEKDAYS_MON_FRI = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export async function getServerSideProps() {
  const supabase = getSupabaseAdmin();

  // Pull only fields needed for dashboard calculations
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id,status,name,email,phone,postcode,address,frequency,extra_bags,use_own_bin,route_day,route_area,next_collection_date,anchor_date,pause_from,pause_to,ops_notes,created_at,updated_at"
    )
    .in("status", ["active", "trialing"]);

  if (error) {
    return {
      props: {
        todayYMD: londonYMD(),
        weekStartYMD: mondayOfWeek(londonYMD()),
        weekDays: WEEKDAYS_MON_FRI.map((d) => ({ day: d, date: "" })),
        today: {
          totalStops: 0,
          extraBags: 0,
          byRouteArea: [],
        },
        week: {
          byRouteDay: [],
        },
        alerts: {
          missingRouteDay: { count: 0, sample: [] },
          missingNextCollectionDate: { count: 0, sample: [] },
        },
        loadError: error.message || "Unknown error loading subscriptions",
      },
    };
  }

  const subs = Array.isArray(data) ? data : [];

  const todayYMD = londonYMD();
  const weekStartYMD = mondayOfWeek(todayYMD);
  const weekEndYMD = addDays(weekStartYMD, 6);

  // ---- Today overview (due today) ----
  const dueToday = subs.filter((s) => normStr(s.next_collection_date) === todayYMD);

  const todayTotalStops = dueToday.length;
  const todayExtraBags = dueToday.reduce((sum, s) => sum + safeInt(s.extra_bags), 0);

  const todayByArea = groupBy(dueToday, (s) => normStr(s.route_area) || "Unassigned");
  const todayByAreaRows = Object.keys(todayByArea)
    .sort(sortRouteAreas)
    .map((area) => {
      const items = todayByArea[area] || [];
      const stops = items.length;
      const extraBags = items.reduce((sum, s) => sum + safeInt(s.extra_bags), 0);
      return { route_area: area, stops, extraBags };
    });

  // ---- Week planner (Mon–Fri) ----
  // We interpret "This week planner" as: for each weekday Mon–Fri,
  // count subscriptions whose route_day == that weekday AND whose next_collection_date is within this week.
  const inThisWeek = subs.filter((s) => {
    const d = normStr(s.next_collection_date);
    if (!d) return false;
    return d >= weekStartYMD && d <= weekEndYMD;
  });

  const weekByRouteDay = WEEKDAYS_MON_FRI.map((dayName) => {
    const dayItems = inThisWeek.filter((s) => normStr(s.route_day) === dayName);
    const totalStops = dayItems.length;
    const extraBags = dayItems.reduce((sum, s) => sum + safeInt(s.extra_bags), 0);

    const byArea = groupBy(dayItems, (s) => normStr(s.route_area) || "Unassigned");
    const byAreaRows = Object.keys(byArea)
      .sort(sortRouteAreas)
      .map((area) => {
        const items = byArea[area] || [];
        return { route_area: area, stops: items.length };
      });

    return { route_day: dayName, totalStops, extraBags, byRouteArea: byAreaRows };
  });

  // ---- Alerts ----
  const missingRouteDay = subs.filter((s) => !normStr(s.route_day));
  const missingNextCollectionDate = subs.filter((s) => !normStr(s.next_collection_date));

  const slim = (s) => ({
    id: s.id,
    name: normStr(s.name) || "(No name)",
    postcode: normStr(s.postcode),
    route_area: normStr(s.route_area),
    route_day: normStr(s.route_day),
    next_collection_date: normStr(s.next_collection_date),
    status: normStr(s.status),
  });

  return {
    props: {
      todayYMD,
      weekStartYMD,
      weekEndYMD,
      today: {
        totalStops: todayTotalStops,
        extraBags: todayExtraBags,
        byRouteArea: todayByAreaRows,
      },
      week: {
        byRouteDay: weekByRouteDay,
      },
      alerts: {
        missingRouteDay: {
          count: missingRouteDay.length,
          sample: missingRouteDay.slice(0, 25).map(slim),
        },
        missingNextCollectionDate: {
          count: missingNextCollectionDate.length,
          sample: missingNextCollectionDate.slice(0, 25).map(slim),
        },
      },
      loadError: null,
    },
  };
}

function StatCard({ title, value, sub }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-600">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-gray-500">{sub}</div> : null}
    </div>
  );
}

function Table({ columns, rows, emptyText = "No data" }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 font-medium text-gray-700">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-3 text-gray-500" colSpan={columns.length}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((r, idx) => (
              <tr key={idx} className="border-t">
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-gray-800">
                    {r[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function MiniList({ items }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="max-h-[360px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium text-gray-700">Name</th>
              <th className="px-3 py-2 font-medium text-gray-700">Postcode</th>
              <th className="px-3 py-2 font-medium text-gray-700">Route</th>
              <th className="px-3 py-2 font-medium text-gray-700">Next</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={4}>
                  None 🎉
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2">{s.postcode}</td>
                  <td className="px-3 py-2">
                    {(s.route_day || "—") + " / " + (s.route_area || "—")}
                  </td>
                  <td className="px-3 py-2">{s.next_collection_date || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OpsDashboardPage(props) {
  const { todayYMD, weekStartYMD, weekEndYMD, today, week, alerts, loadError } = props;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Ops Dashboard</h1>
            <p className="mt-1 text-sm text-gray-600">
              Active + trialing only • Today: <span className="font-medium">{todayYMD}</span> •
              Week: <span className="font-medium">{weekStartYMD}</span> →{" "}
              <span className="font-medium">{weekEndYMD}</span>
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/ops/today"
              className="rounded-lg border bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50"
            >
              Ops Today
            </Link>
            <Link
              href="/ops/subscribers"
              className="rounded-lg border bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50"
            >
              Subscribers
            </Link>
          </div>
        </div>

        {loadError ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <div className="font-semibold">Dashboard failed to load</div>
            <div className="mt-1">{loadError}</div>
          </div>
        ) : null}

        {/* Today overview */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Today overview</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard title="Total stops due today" value={today.totalStops} />
            <StatCard title="Extra bags due today" value={today.extraBags} />
            <StatCard
              title="Routes due today"
              value={today.byRouteArea.length}
              sub="Grouped by route_area"
            />
          </div>

          <div className="mt-4">
            <Table
              columns={[
                { key: "route_area", label: "Route area" },
                { key: "stops", label: "Stops" },
                { key: "extraBags", label: "Extra bags" },
              ]}
              rows={today.byRouteArea}
              emptyText="No collections due today."
            />
          </div>
        </div>

        {/* This week planner */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold">This week planner (Mon–Fri)</h2>
          <p className="mt-1 text-sm text-gray-600">
            Shows active/trialing where <span className="font-medium">route_day</span> matches the weekday
            and <span className="font-medium">next_collection_date</span> is within this week.
          </p>

          <div className="mt-4 space-y-3">
            {week.byRouteDay.map((d) => (
              <div key={d.route_day} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-base font-semibold">{d.route_day}</div>
                  <div className="flex gap-3 text-sm text-gray-700">
                    <span>
                      Stops: <span className="font-semibold">{d.totalStops}</span>
                    </span>
                    <span>
                      Extra bags: <span className="font-semibold">{d.extraBags}</span>
                    </span>
                  </div>
                </div>

                <div className="mt-3">
                  <Table
                    columns={[
                      { key: "route_area", label: "Route area" },
                      { key: "stops", label: "Stops" },
                    ]}
                    rows={d.byRouteArea}
                    emptyText="No stops planned for this day."
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="mb-10">
          <h2 className="text-lg font-semibold">Ops alerts</h2>
          <p className="mt-1 text-sm text-gray-600">
            These will block clean ops planning. Fix them in <span className="font-medium">/ops/subscribers</span>.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold">
                  Missing <span className="font-mono">route_day</span>
                </div>
                <div className="text-sm text-gray-700">
                  Count: <span className="font-semibold">{alerts.missingRouteDay.count}</span>
                </div>
              </div>
              <MiniList items={alerts.missingRouteDay.sample} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold">
                  Missing <span className="font-mono">next_collection_date</span>
                </div>
                <div className="text-sm text-gray-700">
                  Count: <span className="font-semibold">{alerts.missingNextCollectionDate.count}</span>
                </div>
              </div>
              <MiniList items={alerts.missingNextCollectionDate.sample} />
            </div>
          </div>
        </div>

        <div className="text-xs text-gray-500">
          Note: This dashboard intentionally uses the same visibility logic as ops runs:{" "}
          <span className="font-medium">active</span> + <span className="font-medium">trialing</span> only.
        </div>
      </div>
    </div>
  );
}
