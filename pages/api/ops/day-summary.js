// pages/api/ops/day-summary.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

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

function key(area, slot) {
  return `${String(area || "").trim()}|${normSlot(slot)}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  const date = String(req.query.date || "").trim();
  if (!isValidYMD(date)) return res.status(400).json({ error: "Missing/invalid ?date=YYYY-MM-DD" });

  const routeDay = weekdayFromYMD(date);
  if (!routeDay) return res.status(400).json({ error: "Could not derive weekday from date" });

  try {
    // Load route areas (active) and filter to today’s day
    const { data: areas, error: eAreas } = await supabase
      .from("route_areas")
      .select("id,name,route_day,slot,active")
      .eq("active", true);

    if (eAreas) return res.status(500).json({ error: eAreas.message });

    const todays = (areas || []).filter((a) => String(a.route_day) === String(routeDay));
    const combos = [];
    const seen = new Set();

    for (const a of todays) {
      const area = String(a.name || "").trim();
      const slot = normSlot(a.slot || "ANY");
      if (!area) continue;
      const k = key(area, slot);
      if (seen.has(k)) continue;
      seen.add(k);
      combos.push({ area, slot });
    }

    // Prepare counters
    const subCounts = {};
    const bookingCounts = {};
    const dueCounts = {};

    for (const c of combos) {
      subCounts[key(c.area, c.slot)] = 0;
      bookingCounts[key(c.area, c.slot)] = 0;
      dueCounts[key(c.area, c.slot)] = 0;
    }

    // ---- SUBSCRIPTIONS due for this date ----
    // Pull only the routeDay rows; we’ll group by route_area and apply slot matching
    const { data: subsRaw, error: eSubs } = await supabase
      .from("subscriptions")
      .select("id,route_area,route_day,route_slot,frequency,anchor_date,status")
      .eq("status", "active")
      .eq("route_day", routeDay);

    if (eSubs) return res.status(500).json({ error: eSubs.message });

    // For each subscription, determine which run slots it can belong to (ANY/AM/PM cards)
    for (const s of subsRaw || []) {
      const area = String(s.route_area || "").trim();
      if (!area) continue;

      const anchor = s.anchor_date ? String(s.anchor_date).slice(0, 10) : "";
      if (!anchor) continue;

      // must be due
      const due = isDueOnDate({
        runDate: date,
        routeDay: s.route_day,
        anchorDate: anchor,
        frequency: s.frequency,
      });
      if (!due) continue;

      // add it to each slot-card that would accept it
      for (const c of combos) {
        if (c.area !== area) continue;
        if (!matchesRunSlot(c.slot, s.route_slot)) continue;
        const k = key(c.area, c.slot);
        subCounts[k] = (subCounts[k] || 0) + 1;
      }
    }

    // ---- BOOKINGS due for this date ----
    // We use service_date (date column) OR collection_date (legacy text) = date
    const { data: bookingRows, error: eBookings } = await supabase
      .from("bookings")
      .select("id,route_area,route_day,route_slot,service_date,collection_date,status")
      .or(`service_date.eq.${date},collection_date.eq.${date}`);

    if (eBookings) return res.status(500).json({ error: eBookings.message });

    for (const b of bookingRows || []) {
      const st = String(b.status || "booked").toLowerCase();
      if (st === "cancelled" || st === "canceled") continue;

      const area = String(b.route_area || "").trim();
      if (!area) continue;

      // Only count bookings for this planner day
      // (If you have bad legacy rows with route_day = "4" etc, they’ll still appear by date+area,
      // but we keep things consistent by not requiring route_day here.)
      for (const c of combos) {
        if (c.area !== area) continue;
        if (!matchesRunSlot(c.slot, b.route_slot)) continue;
        const k = key(c.area, c.slot);
        bookingCounts[k] = (bookingCounts[k] || 0) + 1;
      }
    }

    // Totals
    for (const c of combos) {
      const k = key(c.area, c.slot);
      dueCounts[k] = (subCounts[k] || 0) + (bookingCounts[k] || 0);
    }

    return res.status(200).json({
      ok: true,
      date,
      routeDay,
      dueCounts, // total
      subCounts,
      bookingCounts,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load day summary" });
  }
}
