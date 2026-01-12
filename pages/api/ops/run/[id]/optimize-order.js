import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

function normSlot(v) {
  const s = String(v || "ANY").toUpperCase().trim();
  return ["ANY", "AM", "PM"].includes(s) ? s : "ANY";
}

function matchesRunSlot(runSlot, itemSlot) {
  const r = normSlot(runSlot);
  const raw = String(itemSlot ?? "").trim();
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
  // Postcode is the key bit for UK geocoding reliability.
  return `${a}${p ? `, ${p}` : ""}, UK`;
}

// ---------- Subscription due logic (copied from driver run API for consistency) ----------
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
// --------------------------------------------------------------------------------------

async function googleDirectionsOptimize({ apiKey, origin, destination, waypointAddresses }) {
  const wp = waypointAddresses.map((w) => encodeURIComponent(w)).join("|");

  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
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
    const providedOrigin = String(body.origin || "").trim();
    const providedDestination = String(body.destination || "").trim();

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

    // ---- Load SUBSCRIPTIONS that are DUE for this run date (same logic as driver) ----
    const { data: subsRaw, error: eSubs } = await supabase
      .from("subscriptions")
      .select("id,address,postcode,route_slot,status,route_area,route_day,frequency,anchor_date")
      .eq("status", "active")
      .eq("route_area", run.route_area)
      .eq("route_day", run.route_day);

    if (eSubs) return res.status(500).json({ error: eSubs.message });

    const subsDue = [];
    for (const s of subsRaw || []) {
      if (!matchesRunSlot(runSlot, s.route_slot)) continue;
      const anchor = s.anchor_date ? String(s.anchor_date).slice(0, 10) : "";
      if (!anchor) continue;

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

    // ---- Load BOOKINGS that are DUE for this run date (same rule as driver) ----
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

    // Unified list (this is what we will order)
    const allStops = [
      ...bookingsDue.map((b) => ({
        type: "booking",
        id: String(b.id),
        address: b.address,
        postcode: b.postcode,
        _addr: fullStopAddress(b),
      })),
      ...subsDue.map((s) => ({
        type: "subscription",
        id: String(s.id),
        address: s.address,
        postcode: s.postcode,
        _addr: fullStopAddress(s),
      })),
    ].filter((x) => !!x._addr);

    if (allStops.length === 0) {
      const { error: eSaveEmpty } = await supabase.from("daily_runs").update({ stop_order: [] }).eq("id", runId);
      if (eSaveEmpty) return res.status(500).json({ error: eSaveEmpty.message });
      return res.status(200).json({ ok: true, stop_order: [], note: "No routable stops." });
    }

    if (allStops.length === 1) {
      const stop_order = [{ type: allStops[0].type, id: allStops[0].id }];
      const { error: eSaveOne } = await supabase.from("daily_runs").update({ stop_order }).eq("id", runId);
      if (eSaveOne) return res.status(500).json({ error: eSaveOne.message });
      return res.status(200).json({ ok: true, stop_order, note: "Only one stop. Saved basic order." });
    }

    // Google Directions standard waypoint limit (excludes origin/destination): ~23
    const MAX_WAYPOINTS = 23;

    let stop_order = [];
    let truncated = false;

    if (providedOrigin) {
      // Yard round-trip mode: origin -> origin (or provided destination) with all stops as waypoints
      const origin = providedOrigin;
      const destination = providedDestination || providedOrigin;

      const sliced = allStops.slice(0, MAX_WAYPOINTS);
      truncated = allStops.length > MAX_WAYPOINTS;

      const waypointAddresses = sliced.map((x) => x._addr);
      const wpOrder = await googleDirectionsOptimize({ apiKey, origin, destination, waypointAddresses });

      stop_order = wpOrder.map((idx) => ({ type: sliced[idx].type, id: sliced[idx].id }));

      // Append remainder if truncated (unsorted)
      for (const x of allStops.slice(MAX_WAYPOINTS)) {
        stop_order.push({ type: x.type, id: x.id });
      }
    } else {
      // One-click mode: first & last stop are anchors, optimise the middle
      const first = allStops[0];
      const last = allStops[allStops.length - 1];

      const middle = allStops.slice(1, -1);
      const middleAllowed = middle.slice(0, MAX_WAYPOINTS);
      truncated = middle.length > MAX_WAYPOINTS;

      if (middleAllowed.length === 0) {
        stop_order = [
          { type: first.type, id: first.id },
          { type: last.type, id: last.id },
        ];
      } else {
        const origin = first._addr;
        const destination = last._addr;
        const waypointAddresses = middleAllowed.map((x) => x._addr);

        const wpOrder = await googleDirectionsOptimize({ apiKey, origin, destination, waypointAddresses });

        stop_order = [
          { type: first.type, id: first.id },
          ...wpOrder.map((idx) => ({ type: middleAllowed[idx].type, id: middleAllowed[idx].id })),
          { type: last.type, id: last.id },
        ];

        // Append remainder if truncated (unsorted)
        for (const x of middle.slice(MAX_WAYPOINTS)) {
          stop_order.push({ type: x.type, id: x.id });
        }
      }
    }

    const { error: eSave } = await supabase.from("daily_runs").update({ stop_order }).eq("id", runId);
    if (eSave) return res.status(500).json({ error: eSave.message });

    return res.status(200).json({ ok: true, stop_order, truncated });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to optimize route" });
  }
}
