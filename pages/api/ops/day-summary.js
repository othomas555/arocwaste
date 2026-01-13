// pages/api/ops/day-summary.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

/* ---------- date helpers (UTC-safe YMD) ---------- */
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_INDEX = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function ymdToUTCDate(ymd) {
  const [Y, M, D] = String(ymd).split("-").map((n) => Number(n));
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

/* ---------- subscription due logic (same as optimize-order/run API) ---------- */
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

/* ---------- quote detection (Man & Van quote visit) ---------- */
function isQuoteVisitBooking(b) {
  const st = String(b?.status || "").toLowerCase();
  const pay = String(b?.payment_status || "").toLowerCase();
  const title = String(b?.title || "").toLowerCase();

  // Primary markers we set in the new API:
  if (st === "quote_requested") return true;
  if (pay === "quote") return true;

  // Fallback markers (safe):
  if (title.includes("quote visit")) return true;

  // If payload exists and includes our mode:
  const mode = String(b?.payload?.mode || "").toLowerCase();
  if (mode === "manvan_quote") return true;

  return false;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  const date = String(req.query.date || "").slice(0, 10);
  if (!isValidYMD(date)) return res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD." });

  const dayName = weekdayFromYMD(date);
  if (!dayName) return res.status(400).json({ error: "Could not derive weekday for date." });

  try {
    // Get route areas active for that day so we know which (area|slot) cards exist
    const { data: areas, error: eAreas } = await supabase
      .from("route_areas")
      .select("name,route_day,slot,active")
      .eq("active", true)
      .eq("route_day", dayName);

    if (eAreas) return res.status(500).json({ error: eAreas.message });

    const combos = [];
    const seen = new Set();
    for (const r of areas || []) {
      const area = String(r.name || "").trim();
      const slot = normSlot(r.slot || "ANY");
      if (!area) continue;
      const key = `${area}|${slot}`;
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push({ area, slot, key });
    }

    // Init breakdown maps with 0 so UI never shows undefined
    const subsCounts = {};
    const bookingsCounts = {};
    const quotesCounts = {};
    const totalCounts = {};

    for (const c of combos) {
      subsCounts[c.key] = 0;
      bookingsCounts[c.key] = 0;
      quotesCounts[c.key] = 0;
      totalCounts[c.key] = 0;
    }

    // ---- subscriptions due ----
    // Pull active subs that are on that weekday (route_day matches area cards)
    const { data: subs, error: eSubs } = await supabase
      .from("subscriptions")
      .select("id,route_area,route_day,route_slot,frequency,anchor_date,status")
      .eq("status", "active")
      .eq("route_day", dayName);

    if (eSubs) return res.status(500).json({ error: eSubs.message });

    for (const s of subs || []) {
      const area = String(s.route_area || "").trim();
      const slot = normSlot(s.route_slot || "ANY");
      const key = `${area}|${slot}`;

      // Only count if this (area|slot) exists as a card for that day
      if (!(key in subsCounts)) continue;

      const anchor = s.anchor_date ? String(s.anchor_date).slice(0, 10) : "";
      if (!anchor) continue;

      if (
        isDueOnDate({
          runDate: date,
          routeDay: s.route_day,
          anchorDate: anchor,
          frequency: s.frequency,
        })
      ) {
        subsCounts[key] += 1;
      }
    }

    // ---- bookings due (includes furniture/appliances etc) ----
    // Due rule: service_date == date OR collection_date == date
    const { data: bookingRows, error: eBookings } = await supabase
      .from("bookings")
      .select("id,route_area,route_day,route_slot,service_date,collection_date,status,payment_status,title,payload")
      .eq("route_day", dayName);

    if (eBookings) return res.status(500).json({ error: eBookings.message });

    for (const b of bookingRows || []) {
      const service = b?.service_date ? String(b.service_date).slice(0, 10) : "";
      const coll = b?.collection_date ? String(b.collection_date).slice(0, 10) : "";
      const dueDate = service || coll;
      if (!dueDate || dueDate !== date) continue;

      const st = String(b.status || "").toLowerCase();
      if (st === "cancelled" || st === "canceled") continue;

      const area = String(b.route_area || "").trim();
      const slot = normSlot(b.route_slot || "ANY");
      const key = `${area}|${slot}`;
      if (!(key in bookingsCounts) && !(key in quotesCounts)) continue;

      // Quote visits counted separately
      if (isQuoteVisitBooking(b)) {
        if (key in quotesCounts) quotesCounts[key] += 1;
      } else {
        if (key in bookingsCounts) bookingsCounts[key] += 1;
      }
    }

    // ---- totals ----
    for (const k of Object.keys(totalCounts)) {
      totalCounts[k] = (subsCounts[k] || 0) + (bookingsCounts[k] || 0) + (quotesCounts[k] || 0);
    }

    return res.status(200).json({
      ok: true,
      date,
      routeDay: dayName,
      // Backward-compatible: dueCounts remains the main total used by older UI
      dueCounts: totalCounts,
      // New: breakdown for nicer UI
      breakdown: {
        subscriptions: subsCounts,
        bookings: bookingsCounts,
        quotes: quotesCounts,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load day summary" });
  }
}
