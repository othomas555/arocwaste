// pages/api/ops/day-summary.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_INDEX = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function ymdToUTCDate(ymd) {
  const [Y, M, D] = ymd.split("-").map((n) => Number(n));
  // noon UTC avoids DST edge issues for date-only comparisons
  return new Date(Date.UTC(Y, M - 1, D, 12, 0, 0));
}

function weekdayFromYMD(ymd) {
  const dt = ymdToUTCDate(ymd);
  const idx = dt.getUTCDay();
  return DAY_NAMES[idx] || null;
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
  const ms = db.getTime() - da.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function normSlot(v) {
  const s = String(v || "ANY").toUpperCase().trim();
  return ["ANY", "AM", "PM"].includes(s) ? s : "ANY";
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
  if (!isValidYMD(runDate)) return { due: false, reason: "bad_runDate" };
  if (!isValidYMD(anchorDate)) return { due: false, reason: "missing_anchor" };

  // ✅ repair “anchor is Monday but route day is Thursday” by shifting anchor to next route day
  const effectiveAnchor = nextOnOrAfter(anchorDate, routeDay);
  if (!effectiveAnchor) return { due: false, reason: "bad_dates" };

  const diffDays = daysBetweenYMD(effectiveAnchor, runDate);
  if (diffDays < 0) return { due: false, reason: "before_anchor" };

  const periodDays = freqWeeks(frequency) * 7;
  return { due: diffDays % periodDays === 0, reason: diffDays % periodDays === 0 ? "due" : "not_due" };
}

function matchesRunSlot(runSlot, subSlot) {
  const r = normSlot(runSlot);
  const sRaw = String(subSlot ?? "").trim();
  const s = sRaw ? normSlot(sRaw) : "BLANK";

  if (r === "ANY") return true;
  // AM run includes AM + ANY + blank
  if (r === "AM") return s === "AM" || s === "ANY" || s === "BLANK";
  // PM run includes PM + ANY + blank
  if (r === "PM") return s === "PM" || s === "ANY" || s === "BLANK";
  return true;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  try {
    const src = req.method === "GET" ? req.query : (req.body || {});
    const date = String(src.date || "").trim();

    if (!isValidYMD(date)) {
      return res.status(400).json({ error: "Invalid date. Expected YYYY-MM-DD." });
    }

    const route_day = weekdayFromYMD(date);
    if (!route_day) return res.status(400).json({ error: "Could not compute weekday for date" });

    // 1) active route areas for that weekday (this drives the cards)
    const { data: routeAreas, error: eAreas } = await supabase
      .from("route_areas")
      .select("id,name,route_day,slot,active")
      .eq("active", true)
      .eq("route_day", route_day);

    if (eAreas) return res.status(500).json({ error: eAreas.message });

    // 2) pull all active subs for that day (not filtered by next_collection_date)
    const { data: subs, error: eSubs } = await supabase
      .from("subscriptions")
      .select("id,status,route_day,route_area,route_slot,frequency,anchor_date")
      .eq("status", "active")
      .eq("route_day", route_day);

    if (eSubs) return res.status(500).json({ error: eSubs.message });

    // Build dueCounts keyed by "Area|SLOT" (exactly what pages/ops/daily-runs.js expects)
    const dueCounts = {};
    let missingAnchor = 0;

    // Pre-build the card keys we care about (area+slot combos from route_areas)
    const cardKeys = new Set();
    for (const r of routeAreas || []) {
      const area = String(r.name || "").trim();
      const slot = normSlot(r.slot || "ANY");
      if (!area) continue;
      cardKeys.add(`${area}|${slot}`);
    }

    // For each subscriber, decide if due on this date, then add them into whichever card slots match
    for (const s of subs || []) {
      const area = String(s.route_area || "").trim();
      if (!area) continue;

      const anchor = s.anchor_date ? String(s.anchor_date).slice(0, 10) : "";
      const check = isDueOnDate({
        runDate: date,
        routeDay: s.route_day,
        anchorDate: anchor,
        frequency: s.frequency,
      });

      if (check.reason === "missing_anchor") missingAnchor++;
      if (!check.due) continue;

      // subscriber slot compared against each run slot card (AM/PM/ANY)
      // but only count against cards that exist for this weekday (routeAreas list)
      for (const key of cardKeys) {
        const [cardArea, cardSlot] = key.split("|");
        if (cardArea !== area) continue;

        if (matchesRunSlot(cardSlot, s.route_slot)) {
          dueCounts[key] = (dueCounts[key] || 0) + 1;
        }
      }
    }

    let warning = "";
    if (missingAnchor > 0) {
      warning = `${missingAnchor} active subscription(s) are missing anchor_date, so they cannot be scheduled.`;
    }

    return res.status(200).json({
      ok: true,
      date,
      route_day,
      // ✅ what daily-runs uses
      dueCounts,
      // useful for debugging / future UI
      routeAreas: routeAreas || [],
      totals: {
        routeAreas: (routeAreas || []).length,
        activeSubsForDay: (subs || []).length,
        missingAnchor,
      },
      warning,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load day summary" });
  }
}
