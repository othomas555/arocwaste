// pages/api/ops/run/[id].js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const DAY_INDEX = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function normSlot(v) {
  const s = String(v || "ANY").toUpperCase().trim();
  return ["ANY", "AM", "PM"].includes(s) ? s : "ANY";
}

function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function ymdToUTCDate(ymd) {
  const [Y, M, D] = ymd.split("-").map((n) => Number(n));
  return new Date(Date.UTC(Y, M - 1, D, 12, 0, 0));
}

function addDaysYMD(ymd, days) {
  const dt = ymdToUTCDate(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekdayFromYMD(ymd) {
  const dt = ymdToUTCDate(ymd);
  const idx = dt.getUTCDay(); // 0-6
  return Object.keys(DAY_INDEX).find((k) => DAY_INDEX[k] === idx) || null;
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

function daysBetweenYMD(a, b) {
  const da = ymdToUTCDate(a);
  const db = ymdToUTCDate(b);
  const ms = db.getTime() - da.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function isDueOnDate({ runDate, routeDay, anchorDate, frequency }) {
  if (!isValidYMD(runDate) || !isValidYMD(anchorDate)) return { due: false, reason: "missing_anchor" };

  // Align anchor to route day (repairs “anchor is Friday but route_day is Monday”)
  const effectiveAnchor = nextOnOrAfter(anchorDate, routeDay);
  if (!effectiveAnchor) return { due: false, reason: "bad_dates" };

  const diffDays = daysBetweenYMD(effectiveAnchor, runDate);
  if (diffDays < 0) return { due: false, reason: "before_anchor" };

  const periodDays = freqWeeks(frequency) * 7;
  return { due: diffDays % periodDays === 0, reason: diffDays % periodDays === 0 ? "due" : "not_due" };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  try {
    const { data: run, error: eRun } = await supabase
      .from("daily_runs")
      .select(
        `
        id, run_date, route_day, route_area, route_slot, vehicle_id, notes,
        vehicles:vehicles(id, registration, name),
        daily_run_staff:daily_run_staff(
          staff_id,
          staff:staff(id, name, role, active)
        )
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (eRun) return res.status(500).json({ error: eRun.message });
    if (!run) return res.status(404).json({ error: "Run not found" });

    if (!isValidYMD(run.run_date)) {
      return res.status(500).json({ error: "Run has invalid run_date" });
    }

    const runSlot = normSlot(run.route_slot);

    // Pull ALL active subs for that area/day, then compute due deterministically in JS
    let subsQ = supabase
      .from("subscriptions")
      .select(
        "id,address,postcode,extra_bags,use_own_bin,route_slot,ops_notes,route_day,route_area,status,frequency,anchor_date"
      )
      .eq("status", "active")
      .eq("route_day", run.route_day)
      .eq("route_area", run.route_area);

    if (runSlot !== "ANY") {
      subsQ = subsQ.or(`route_slot.eq.${runSlot},route_slot.eq.ANY,route_slot.is.null,route_slot.eq.""`);
    }

    const { data: subsRaw, error: eSubs } = await subsQ
      .order("postcode", { ascending: true })
      .order("address", { ascending: true });

    if (eSubs) return res.status(500).json({ error: eSubs.message });

    const subsDue = [];
    let missingAnchor = 0;

    for (const s of subsRaw || []) {
      const anchor = s.anchor_date ? String(s.anchor_date).slice(0, 10) : "";
      const check = isDueOnDate({
        runDate: run.run_date,
        routeDay: s.route_day,
        anchorDate: anchor,
        frequency: s.frequency,
      });

      if (check.reason === "missing_anchor") missingAnchor++;
      if (check.due) subsDue.push(s);
    }

    // collected map for subs due
    const subscriptionIds = subsDue.map((s) => s.id);
    let collectedMap = new Map();
    if (subscriptionIds.length) {
      const { data: cols, error: eCols } = await supabase
        .from("subscription_collections")
        .select("subscription_id")
        .eq("collected_date", run.run_date)
        .in("subscription_id", subscriptionIds);

      if (eCols) return res.status(500).json({ error: eCols.message });
      collectedMap = new Map((cols || []).map((c) => [c.subscription_id, true]));
    }

    const subStops = subsDue.map((s) => ({
      key: `subscription:${s.id}`,
      type: "subscription",
      id: s.id,
      address: s.address,
      postcode: s.postcode,
      route_slot: s.route_slot || null,
      ops_notes: s.ops_notes || null,
      extra_bags: Number(s.extra_bags) || 0,
      use_own_bin: !!s.use_own_bin,
      collected: !!collectedMap.get(s.id),
    }));

    // BOOKINGS due that day (still uses service_date)
    let bookingsQ = supabase
      .from("bookings")
      .select("id,title,service_date,postcode,address,route_day,route_area,route_slot,status,completed_at,total_pence,notes,payload")
      .eq("service_date", run.run_date)
      .eq("route_day", run.route_day)
      .eq("route_area", run.route_area)
      .not("status", "in", "(cancelled)");

    if (runSlot !== "ANY") {
      bookingsQ = bookingsQ.or(`route_slot.eq.${runSlot},route_slot.eq.ANY,route_slot.is.null,route_slot.eq.""`);
    }

    const { data: bookings, error: eBookings } = await bookingsQ
      .order("postcode", { ascending: true })
      .order("address", { ascending: true });

    if (eBookings) return res.status(500).json({ error: eBookings.message });

    const bookingStops = (bookings || []).map((b) => {
      const isCompleted = String(b.status || "").toLowerCase() === "completed" || !!b.completed_at;
      return {
        key: `booking:${b.id}`,
        type: "booking",
        id: b.id,
        title: String(b.title || "Booking"),
        address: String(b.address || b?.payload?.address || "— address missing —"),
        postcode: String(b.postcode || b?.payload?.postcode || "— postcode missing —"),
        route_slot: b.route_slot || null,
        total_pence: Number(b.total_pence) || 0,
        notes: String(b.notes || b?.payload?.notes || ""),
        collected: isCompleted,
      };
    });

    const stops = [...subStops, ...bookingStops].sort((a, b) => {
      const ap = String(a.postcode || "").localeCompare(String(b.postcode || ""));
      if (ap !== 0) return ap;
      const aa = String(a.address || "").localeCompare(String(b.address || ""));
      if (aa !== 0) return aa;
      return String(a.type || "").localeCompare(String(b.type || ""));
    });

    const totals = {
      totalStops: stops.length,
      totalExtraBags: subStops.reduce((sum, s) => sum + (Number(s.extra_bags) || 0), 0),
      totalBookings: bookingStops.length,
      totalSubscriptions: subStops.length,
    };

    let warning = "";
    if (missingAnchor > 0) {
      warning = `${missingAnchor} active subscription(s) are missing anchor_date, so they cannot be scheduled.`;
    }

    return res.status(200).json({ run, stops, totals, warning });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load run" });
  }
}
