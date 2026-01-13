// pages/api/ops/run/[id].js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function normSlot(v) {
  const s = String(v || "ANY").toUpperCase().trim();
  return ["ANY", "AM", "PM"].includes(s) ? s : "ANY";
}

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
function matchesRunSlot(runSlot, subSlot) {
  const r = normSlot(runSlot);
  const raw = String(subSlot ?? "").trim();
  const s = raw ? normSlot(raw) : "BLANK";
  if (r === "ANY") return true;
  if (r === "AM") return s === "AM" || s === "ANY" || s === "BLANK";
  if (r === "PM") return s === "PM" || s === "ANY" || s === "BLANK";
  return true;
}

function safeItemsSummary(payload) {
  try {
    const items = payload?.items;
    if (!Array.isArray(items) || items.length === 0) return "";
    const titles = items
      .map((x) => String(x?.title || "").trim())
      .filter(Boolean)
      .slice(0, 3);
    if (!titles.length) return "";
    const suffix = items.length > titles.length ? ` + ${items.length - titles.length} more` : "";
    return titles.join(", ") + suffix;
  } catch {
    return "";
  }
}

/* ---------- Quote visit detection ---------- */
function isQuoteVisitBooking(b) {
  const st = String(b?.status || "").toLowerCase();
  const pay = String(b?.payment_status || "").toLowerCase();

  // If you set these explicitly in your Man&Van “request quote” flow:
  if (st === "quote_requested") return true;
  if (pay === "quote") return true;

  // Fallbacks that won’t break existing bookings:
  const title = String(b?.title || "").toLowerCase();
  if (title.includes("quote visit")) return true;

  const mode = String(b?.payload?.mode || "").toLowerCase();
  if (mode === "manvan_quote") return true;

  return false;
}

function bookingTypeFor(b) {
  return isQuoteVisitBooking(b) ? "quote_visit" : "job";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing id" });

  try {
    const { data: run, error: eRun } = await supabase
      .from("daily_runs")
      .select(
        `
        id, run_date, route_day, route_area, route_slot, vehicle_id, notes, stop_order,
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
      return res.status(500).json({ error: "Run has invalid run_date", debug: { run_date: run.run_date } });
    }

    const runSlot = normSlot(run.route_slot);

    // ----------------------------
    // SUBSCRIPTIONS
    // ----------------------------
    let q = supabase
      .from("subscriptions")
      .select(
        "id,address,postcode,extra_bags,use_own_bin,route_slot,ops_notes,anchor_date,frequency,route_day,route_area,status"
      )
      .eq("status", "active")
      .eq("route_day", run.route_day)
      .eq("route_area", run.route_area);

    if (runSlot !== "ANY") {
      q = q.or(`route_slot.eq.${runSlot},route_slot.eq.ANY,route_slot.is.null,route_slot.eq.""`);
    }

    const { data: subsRaw, error: eSubs } = await q
      .order("postcode", { ascending: true })
      .order("address", { ascending: true });

    if (eSubs) return res.status(500).json({ error: eSubs.message });

    const subsDue = [];
    let missingAnchors = 0;

    for (const s of subsRaw || []) {
      const anchor = s.anchor_date ? String(s.anchor_date).slice(0, 10) : "";
      if (!anchor) {
        missingAnchors += 1;
        continue;
      }
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

    let stops = subsDue.map((s) => ({
      ...s,
      collected: !!collectedMap.get(s.id),
    }));

    // ----------------------------
    // BOOKINGS
    // ----------------------------
    let bq = supabase
      .from("bookings")
      .select(
        "id, booking_ref, title, service_date, collection_date, route_area, route_day, route_slot, status, payment_status, name, email, phone, postcode, address, notes, total_pence, payload, completed_at, completed_by_run_id"
      )
      .eq("route_area", run.route_area)
      .eq("route_day", run.route_day);

    bq = bq.or(`service_date.eq.${run.run_date},collection_date.eq.${run.run_date}`);
    bq = bq.neq("status", "cancelled");

    if (runSlot !== "ANY") {
      bq = bq.or(`route_slot.eq.${runSlot},route_slot.eq.ANY,route_slot.is.null,route_slot.eq.""`);
    }

    const { data: bookingsRaw, error: eBookings } = await bq
      .order("postcode", { ascending: true })
      .order("address", { ascending: true });

    if (eBookings) {
      return res.status(500).json({
        error: eBookings.message,
        hint:
          "If this mentions missing columns like completed_at/completed_by_run_id, run the SQL migration I provided to add them.",
      });
    }

    let bookings = (bookingsRaw || [])
      .filter((b) => matchesRunSlot(runSlot, b.route_slot))
      .map((b) => {
        const completed = !!b.completed_at;
        const type = bookingTypeFor(b);
        return {
          id: b.id,
          booking_ref: b.booking_ref,
          title: b.title,
          service_date: b.service_date,
          collection_date: b.collection_date,
          route_area: b.route_area,
          route_day: b.route_day,
          route_slot: b.route_slot,
          status: b.status,
          payment_status: b.payment_status,
          name: b.name,
          email: b.email,
          phone: b.phone,
          postcode: b.postcode,
          address: b.address,
          notes: b.notes,
          total_pence: b.total_pence,
          items_summary: safeItemsSummary(b.payload),
          payload: b.payload,
          completed_at: b.completed_at,
          completed_by_run_id: b.completed_by_run_id,
          completed,

          // ✅ NEW flags for UI styling
          booking_type: type, // "quote_visit" | "job"
          requires_visit: type === "quote_visit",
        };
      });

    // ----------------------------
    // Apply stop_order (if present)
    // ----------------------------
    // If run.stop_order exists, reorder bookings + stops to match it.
    // Anything missing from stop_order is appended at the end.
    try {
      const order = Array.isArray(run.stop_order) ? run.stop_order : null;
      if (order && order.length) {
        const bMap = new Map(bookings.map((x) => [String(x.id), x]));
        const sMap = new Map(stops.map((x) => [String(x.id), x]));

        const bookingsOrdered = [];
        const stopsOrdered = [];
        const usedB = new Set();
        const usedS = new Set();

        for (const o of order) {
          const type = String(o?.type || "").toLowerCase();
          const oid = String(o?.id || "");
          if (!oid) continue;

          if (type === "booking" && bMap.has(oid)) {
            bookingsOrdered.push(bMap.get(oid));
            usedB.add(oid);
          }
          if (type === "subscription" && sMap.has(oid)) {
            stopsOrdered.push(sMap.get(oid));
            usedS.add(oid);
          }
        }

        // append leftovers
        for (const b of bookings) {
          const k = String(b.id);
          if (!usedB.has(k)) bookingsOrdered.push(b);
        }
        for (const s of stops) {
          const k = String(s.id);
          if (!usedS.has(k)) stopsOrdered.push(s);
        }

        bookings = bookingsOrdered;
        stops = stopsOrdered;
      }
    } catch {
      // ignore ordering errors; keep default sort
    }

    const totalQuoteVisits = bookings.reduce((sum, b) => sum + (b.booking_type === "quote_visit" ? 1 : 0), 0);
    const totalCompletedQuoteVisits = bookings.reduce(
      (sum, b) => sum + (b.booking_type === "quote_visit" && b.completed ? 1 : 0),
      0
    );

    const totals = {
      totalStops: stops.length,
      totalExtraBags: stops.reduce((sum, s) => sum + (Number(s.extra_bags) || 0), 0),
      totalBookings: bookings.length,
      totalCompletedBookings: bookings.reduce((sum, b) => sum + (b.completed ? 1 : 0), 0),

      // ✅ NEW
      totalQuoteVisits,
      totalCompletedQuoteVisits,
    };

    let warning = "";
    if (missingAnchors > 0) {
      warning = `Warning: ${missingAnchors} active subscriber(s) in this area/day have no anchor_date so they could not be scheduled.`;
    }

    return res.status(200).json({
      run,
      stops,
      bookings,
      totals,
      warning,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load run" });
  }
}
