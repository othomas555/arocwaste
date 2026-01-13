// pages/api/ops/run/[id]/optimize-order.js
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

function normSlot(v) {
  const s = String(v || "ANY").toUpperCase().trim();
  return ["ANY", "AM", "PM"].includes(s) ? s : "ANY";
}

function matchesRunSlot(runSlot, rowSlot) {
  const r = normSlot(runSlot);
  const raw = String(rowSlot ?? "").trim();
  const s = raw ? normSlot(raw) : "BLANK";
  if (r === "ANY") return true;
  if (r === "AM") return s === "AM" || s === "ANY" || s === "BLANK";
  if (r === "PM") return s === "PM" || s === "ANY" || s === "BLANK";
  return true;
}

function fullStopAddress(row) {
  const a = String(row.address || "").trim();
  const p = String(row.postcode || "").trim();
  if (!a && !p) return "";
  // UK-friendly: include postcode to help geocode
  return `${a}${p ? `, ${p}` : ""}, UK`;
}

/* ---------- Subscription “due” logic (mirrors driver run API) ---------- */
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_INDEX = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function ymdToUTCDate(ymd) {
  const [Y, M, D] = ymd.split("-").map((n) => Number(n));
  return new Date(Date.UTC(Y, M - 1, D, 12, 0, 0));
}
function weekdayFromYMD(ymd) {
  const dt = ymdToUTCDate(ymd);
  return DAY_NAMES[dt.getUTCDay()] || null;
}
function addDaysYMD(ymd, days) {
  const dt = ymdToUTCDate(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function daysBetweenYMD(a, b) {
  const da = ymdToUTCDate(a);
  const db = ymdToUTCDate(b);
  return Math.round((db.getTime() - da.getTime()) / (24 * 60 * 60 * 1000));
}
function freqWeeks(frequency) {
  const f = String(frequency || "").toLowerCase().trim();
  if (f === "weekly") return 1;
  if (f === "fortnightly") return 2;
  if (f === "threeweekly") return 3;
  return 1;
}
function nextOnOrAfter(anchorYMD, routeDay) {
  if (!isValidYMD(anchorYMD)) return null;
  const aDowName = weekdayFromYMD(anchorYMD);
  const aDow = DAY_INDEX[aDowName];
  const tDow = DAY_INDEX[String(routeDay || "").trim()];
  if (aDow === undefined || tDow === undefined) return null;
  const delta = (tDow - aDow + 7) % 7;
  return addDaysYMD(anchorYMD, delta);
}
function isDueOnDate({ runDate, routeDay, anchorDate, frequency }) {
  if (!isValidYMD(runDate) || !isValidYMD(anchorDate)) return false;
  const effectiveAnchor = nextOnOrAfter(anchorDate, routeDay);
  if (!effectiveAnchor) return false;
  const diffDays = daysBetweenYMD(effectiveAnchor, runDate);
  if (diffDays < 0) return false;
  const periodDays = freqWeeks(frequency) * 7;
  return diffDays % periodDays === 0;
}

/* ---------- Google Directions “optimize:true” ---------- */
async function googleOptimize({ apiKey, origin, destination, waypoints }) {
  // IMPORTANT: Do NOT prepend `via:` here — we want stable `waypoint_order`.
  // Note: each waypoint is URL encoded; pipes are separators.
  const wp = waypoints.map((w) => encodeURIComponent(w)).join("|");

  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination || origin)}` +
    `&waypoints=optimize:true|${wp}` +
    `&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(`Google Directions failed (${res.status})`);
  if (json.status !== "OK") {
    throw new Error(`Google Directions status: ${json.status} ${json.error_message || ""}`.trim());
  }

  const route = json.routes?.[0];
  const order = route?.waypoint_order;
  if (!Array.isArray(order)) throw new Error("Google Directions did not return waypoint_order");

  return order;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY in env vars" });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  const runId = String(req.query.id || "").trim();
  if (!runId) return res.status(400).json({ error: "Missing run id" });

  try {
    const body = req.body || {};
    const origin = String(body.origin || "").trim();
    const destination = String(body.destination || "").trim();

    if (!origin) {
      return res.status(400).json({
        error: "Missing origin. Provide { origin: 'your depot address, postcode' }",
      });
    }

    const { data: run, error: eRun } = await supabase
      .from("daily_runs")
      .select("id, run_date, route_day, route_area, route_slot")
      .eq("id", runId)
      .maybeSingle();

    if (eRun) return res.status(500).json({ error: eRun.message });
    if (!run) return res.status(404).json({ error: "Run not found" });

    if (!isValidYMD(run.run_date)) {
      return res.status(500).json({ error: "Run has invalid run_date", debug: { run_date: run.run_date } });
    }

    const runSlot = normSlot(run.route_slot);

    // ----- Subscriptions (due only) -----
    let subsQuery = supabase
      .from("subscriptions")
      .select("id,address,postcode,route_slot,status,route_area,route_day,frequency,anchor_date")
      .eq("status", "active")
      .eq("route_area", run.route_area)
      .eq("route_day", run.route_day);

    if (runSlot !== "ANY") {
      subsQuery = subsQuery.or(`route_slot.eq.${runSlot},route_slot.eq.ANY,route_slot.is.null,route_slot.eq.""`);
    }

    const { data: subsRaw, error: eSubs } = await subsQuery;
    if (eSubs) return res.status(500).json({ error: eSubs.message });

    const subsDue = [];
    for (const s of subsRaw || []) {
      const anchor = s.anchor_date ? String(s.anchor_date).slice(0, 10) : "";
      if (!anchor) continue;
      if (!matchesRunSlot(runSlot, s.route_slot)) continue;

      if (
        isDueOnDate({
          runDate: run.run_date,
          routeDay: s.route_day,
          anchorDate: anchor,
          frequency: s.frequency,
        })
      ) {
        subsDue.push(s);
      }
    }

    // ----- Bookings (due only) -----
    const { data: bookingRows, error: eBookings } = await supabase
      .from("bookings")
      .select("id,address,postcode,route_slot,route_area,route_day,service_date,collection_date,status")
      .eq("route_area", run.route_area)
      .eq("route_day", run.route_day);

    if (eBookings) return res.status(500).json({ error: eBookings.message });

    const bookingsDue = [];
    for (const b of bookingRows || []) {
      const service = b?.service_date ? String(b.service_date).slice(0, 10) : "";
      const coll = b?.collection_date ? String(b.collection_date).slice(0, 10) : "";
      const dueDate = service || coll;

      if (!dueDate || dueDate !== run.run_date) continue;
      if (!matchesRunSlot(runSlot, b.route_slot)) continue;

      const st = String(b.status || "booked").toLowerCase();
      if (st === "cancelled" || st === "canceled") continue;

      bookingsDue.push(b);
    }

    // Build unified stop list for routing (bookings first then subs)
    const all = [
      ...bookingsDue.map((b) => ({ type: "booking", id: String(b.id), address: b.address, postcode: b.postcode })),
      ...subsDue.map((s) => ({ type: "subscription", id: String(s.id), address: s.address, postcode: s.postcode })),
    ].filter((x) => fullStopAddress(x));

    if (all.length < 2) {
      const stop_order = all.map((x) => ({ type: x.type, id: x.id }));
      const { error: eSave0 } = await supabase.from("daily_runs").update({ stop_order }).eq("id", runId);
      if (eSave0) return res.status(500).json({ error: eSave0.message });
      return res.status(200).json({ ok: true, stop_order, note: "Not enough stops to optimize. Saved basic order." });
    }

    // Google standard Directions has a waypoint limit (~23). Keep safe.
    const MAX_WAYPOINTS = 23;
    const sliced = all.slice(0, MAX_WAYPOINTS);

    const waypoints = sliced.map((x) => fullStopAddress(x));
    const wpOrder = await googleOptimize({
      apiKey,
      origin,
      destination: destination || origin,
      waypoints,
    });

    // wpOrder gives indices into `waypoints` (and therefore `sliced`)
    const stop_order = wpOrder.map((idx) => ({ type: sliced[idx].type, id: sliced[idx].id }));

    // If we truncated due to waypoint limits, append remainder at end (unsorted)
    for (const x of all.slice(MAX_WAYPOINTS)) {
      stop_order.push({ type: x.type, id: x.id });
    }

    const { error: eSave } = await supabase.from("daily_runs").update({ stop_order }).eq("id", runId);
    if (eSave) return res.status(500).json({ error: eSave.message });

    return res.status(200).json({
      ok: true,
      stop_order,
      truncated: all.length > MAX_WAYPOINTS,
      counts: { total: all.length, optimized: Math.min(all.length, MAX_WAYPOINTS) },
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to optimize route" });
  }
}
