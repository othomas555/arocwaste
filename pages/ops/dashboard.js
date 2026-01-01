import React from "react";
import Link from "next/link";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

/**
 * Ops Dashboard
 * - Today overview (due today): total stops, extra bags, grouped by route_area
 * - This week planner (Mon–Fri): DATE-DRIVEN using next_collection_date (actual Mon–Fri dates)
 * - Ops alerts: active/trialing missing route_day, missing next_collection_date
 *
 * Visibility logic:
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
  // ymd is YYYY-MM-DD, interpret as midnight UTC on that date, add days,
  // then re-format back to YYYY-MM-DD in London.
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return londonYMD(dt);
}

function mondayOfWeek(ymd) {
  // Get Monday (YYYY-MM-DD) for the week containing ymd, using London day-of-week.
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));

  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TZ,
    weekday: "short",
  }).format(dt); // "Mon" etc.

  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const offset = map[weekday] ?? 0;
  return addDays(ymd, -offset);
}

function weekdayNameFromYMD(ymd) {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-GB", { timeZone: LONDON_TZ, weekday: "long" }).format(dt);
}

function humanDateFromYMD(ymd) {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(dt);
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
  const aa = normStr(a);
  const bb = normStr(b);
  if (!aa && bb) return 1;
  if (aa && !bb) return -1;
  return aa.localeCompare(bb);
}

function sortRouteDays(a, b) {
  const order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Unassigned"];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  if (ai === -1 && bi === -1) return a.localeCompare(b);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}

const WEEKDAY_OFFSETS_MON_FRI = [
  { name: "Monday", offset: 0 },
  { name: "Tuesday", offset: 1 },
  { name: "Wednesday", offset: 2 },
  { name: "Thursday", offset: 3 },
  { name: "Friday", offset: 4 },
];

export async function getServerSideProps() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id,status,name,email,phone,postcode,address,frequency,extra_bags,use_own_bin,route_day,route_area,next_collection_date,anchor_date,pause_from,pause_to,ops_notes,created_at,updated_at"
    )
    .in("status", ["active", "trialing"]);

  const todayYMD = londonYMD();
  const weekStartYMD = mondayOfWeek(todayYMD);
  const weekEndYMD = addDays(weekStartYMD, 6);

  const weekDaysMonFri = WEEKDAY_OFFSETS_MON_FRI.map((w) => {
    const dateYMD = addDays(weekStartYMD, w.offset);
    return {
      weekday: weekdayNameFromYMD(dateYMD),
      dateYMD,
      dateHuman: humanDateFromYMD(dateYMD),
    };
  });

  if (error) {
    return {
      props: {
        todayYMD,
        weekStartYMD,
        weekEndYMD,
        weekDaysMonFri,
        today: { totalStops: 0, extraBags: 0, byRouteArea: [] },
        week: { byDate: [] },
        alerts: {
          missingRouteDay: { count: 0, sample: [] },
          missingNextCollectionDate: { count: 0, sample: [] },
        },
        loadError: error.message || "Unknown error loading subscriptions",
      },
    };
  }

  const subs = Array.isArray(data) ? data : [];

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

  // ---- Week planner (DATE-DRIVEN Mon–Fri) ----
  // Primary truth = next_collection_date. For each Mon–Fri date in THIS week:
  // show stops where next_collection_date == that date.
  const byDate = weekDaysMonFri.map((wd) => {
    const dateItems = subs.filter((s) => normStr(s.next_collection_date) === wd.dateYMD);

    const totalStops = dateItems.length;
    const extraBags = dateItems.reduce((sum, s) => sum + safeInt(s.extra_bags), 0);

    const byArea = groupBy(dateItems, (s) => normStr(s.route_area) || "Unassigned");
    const byAreaRows = Object.keys(byArea)
      .sort(sortRouteAreas)
      .map((area) => ({ route_area: area, stops: (byArea[area] || []).length }));

    // Useful sanity check: what route_days are present on this date (if any)
    const byDay = groupBy(dateItems, (s) => normStr(s.route_day) || "Unassigned");
    const byDayRows = Object.keys(byDay)
      .sort(sortRouteDays)
      .map((day) => ({ route_day: day, stops: (byDay[day] || []).length }));

    return {
      weekday: wd.weekday,
      dateYMD: wd.dateYMD,
      dateHuman: wd.dateHuman,
      totalStops,
      extraBags,
      byRouteArea: byAreaRows,
      byRouteDay: byDayRows,
    };
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
      weekDaysMonFri,
      today: {
        totalStops: todayTotalStops,
        extraBags: todayExtraBags,
        byRouteArea: todayByAreaRows,
      },
      week: { byDate },
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

        {/* This week planner - DATE DRIVEN */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold">This week planner (Mon–Fri)</h2>
          <p className="mt-1 text-sm text-gray-600">
            Date-driven from <span className="font-medium">next_collection_date</span>. Route fields are shown as
            breakdowns (useful for spotting bad route assignments).
          </p>

          <div className="mt-4 space-y-3">
            {week.byDate.map((d) => (
              <div key={d.dateYMD} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-base font-semibold">
                      {d.weekday} <span className="text-gray-500">•</span>{" "}
                      <span className="font-normal text-gray-700">{d.dateHuman}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">Date: {d.dateYMD}</div>
                  </div>

                  <div className="flex gap-3 text-sm text-gray-700">
                    <span>
                      Stops: <span className="font-semibold">{d.totalStops}</span>
                    </span>
                    <span>
                      Extra bags: <span className="font-semibold">{d.extraBags}</span>
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 text-sm font-semibold text-gray-800">By route_area</div>
                    <Table
                      columns={[
                        { key: "route_area", label: "Route area" },
                        { key: "stops", label: "Stops" },
                      ]}
                      rows={d.byRouteArea}
                      emptyText="No stops planned for this date."
                    />
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-semibold text-gray-800">By route_day (sanity check)</div>
                    <Table
                      columns={[
                        { key: "route_day", label: "Route day" },
                        { key: "stops", label: "Stops" },
                      ]}
                      rows={d.byRouteDay}
                      emptyText="No stops planned for this date."
                    />
                  </div>
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
          Note: This dashboard intentionally matches ops visibility rules:{" "}
          <span className="font-medium">active</span> + <span className="font-medium">trialing</span> only.
        </div>
      </div>
    </div>
  );
}
