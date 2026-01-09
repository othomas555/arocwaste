// pages/api/ops/day-summary.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function ymdToWeekdayLondon(ymd) {
  // Use UTC noon to avoid DST edge weirdness for date-only values
  const [Y, M, D] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(Y, M - 1, D, 12, 0, 0));
  const dow = dt.getUTCDay(); // 0-6
  return DAY_NAMES[dow] || null;
}

function normSlot(v) {
  const s = String(v || "ANY").toUpperCase().trim();
  return ["ANY", "AM", "PM"].includes(s) ? s : "ANY";
}

function slotBucket(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return "BLANK";
  const s = raw.toUpperCase();
  if (s === "AM") return "AM";
  if (s === "PM") return "PM";
  if (s === "ANY") return "ANY";
  return "OTHER";
}

function areaKey(area, slot) {
  return `${String(area || "").trim()}|${normSlot(slot)}`;
}

export default async function handler(req, res) {
  // ✅ accept GET and POST so UI can use either without 405
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

    const route_day = ymdToWeekdayLondon(date);
    if (!route_day) return res.status(400).json({ error: "Could not compute weekday for date" });

    // 1) route areas active for that weekday
    const { data: routeAreas, error: eAreas } = await supabase
      .from("route_areas")
      .select("id,name,route_day,slot,active,postcode_prefixes")
      .eq("active", true)
      .eq("route_day", route_day);

    if (eAreas) return res.status(500).json({ error: eAreas.message });

    // 2) existing runs already created for that date/day
    const { data: runs, error: eRuns } = await supabase
      .from("daily_runs")
      .select("id,run_date,route_day,route_area,route_slot,vehicle_id,notes,created_at")
      .eq("run_date", date)
      .eq("route_day", route_day);

    if (eRuns) return res.status(500).json({ error: eRuns.message });

    // 3) subscriptions due that day (for counts)
    const { data: subsDue, error: eSubs } = await supabase
      .from("subscriptions")
      .select("id,route_area,route_slot,next_collection_date,route_day,status")
      .eq("status", "active")
      .eq("next_collection_date", date)
      .eq("route_day", route_day);

    if (eSubs) return res.status(500).json({ error: eSubs.message });

    // 4) bookings due that day (for counts)
    // NOTE: requires bookings.service_date + route_day/route_area populated
    const { data: bookingsDue, error: eBookings } = await supabase
      .from("bookings")
      .select("id,route_area,route_slot,service_date,status,completed_at")
      .eq("service_date", date)
      .eq("route_day", route_day)
      .not("status", "in", "(cancelled)");

    // If bookings table doesn't have these columns yet, show a warning instead of failing the whole day page.
    let bookingsWarning = "";
    if (eBookings) {
      bookingsWarning =
        "Bookings could not be counted (schema mismatch). Ensure bookings has service_date, route_day, route_area, route_slot, status.";
    }

    // Build area+slot list from route_areas (this is what ops sees/plans by)
    const areaSlotRows = (routeAreas || []).map((r) => ({
      route_area_id: r.id,
      route_area: r.name,
      route_day: r.route_day,
      route_slot: normSlot(r.slot || "ANY"),
      postcode_prefix_count: Array.isArray(r.postcode_prefixes) ? r.postcode_prefixes.length : 0,
    }));

    // Aggregate counts per area+slot
    const counts = new Map(); // key -> { subsTotal, bookingsTotal, completedBookings }
    function bump(mapKey, field, inc = 1) {
      if (!counts.has(mapKey)) counts.set(mapKey, { subsTotal: 0, bookingsTotal: 0, completedBookings: 0 });
      const obj = counts.get(mapKey);
      obj[field] += inc;
    }

    for (const s of subsDue || []) {
      const k = areaKey(s.route_area, s.route_slot);
      bump(k, "subsTotal", 1);
    }

    if (!eBookings) {
      for (const b of bookingsDue || []) {
        const k = areaKey(b.route_area, b.route_slot);
        bump(k, "bookingsTotal", 1);
        const done = String(b.status || "").toLowerCase() === "completed" || !!b.completed_at;
        if (done) bump(k, "completedBookings", 1);
      }
    }

    // Attach counts + existing runs to each area+slot row
    const outRows = areaSlotRows
      .map((r) => {
        const k = areaKey(r.route_area, r.route_slot);
        const c = counts.get(k) || { subsTotal: 0, bookingsTotal: 0, completedBookings: 0 };

        const existingRuns = (runs || []).filter(
          (x) =>
            String(x.route_area || "").trim() === String(r.route_area || "").trim() &&
            normSlot(x.route_slot) === normSlot(r.route_slot)
        );

        return {
          ...r,
          counts: c,
          existing_runs: existingRuns,
        };
      })
      .sort((a, b) => {
        const n = String(a.route_area || "").localeCompare(String(b.route_area || ""));
        if (n !== 0) return n;
        return String(a.route_slot || "").localeCompare(String(b.route_slot || ""));
      });

    // Helpful warnings for “why don’t jobs show”
    let warning = "";
    const noAreas = outRows.length === 0;
    if (noAreas) {
      warning = `No active route areas found for ${route_day}.`;
    } else if ((subsDue || []).length === 0) {
      warning =
        `No subscriptions due on ${date}. If you expected one, check that their next_collection_date is ${date} and status=active.`;
    }

    const response = {
      ok: true,
      date,
      route_day,

      // keys your UI might be using (be generous for compatibility)
      areas: outRows,
      routes: outRows,
      data: outRows,

      runs: runs || [],
      totals: {
        areas: outRows.length,
        subscriptions_due: (subsDue || []).length,
        bookings_due: eBookings ? null : (bookingsDue || []).length,
      },

      warning: [warning, bookingsWarning].filter(Boolean).join(" ").trim() || "",
    };

    return res.status(200).json(response);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load day summary" });
  }
}
