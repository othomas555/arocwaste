// pages/api/ops/run/[id].js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function normSlot(v) {
  const s = String(v || "ANY").toUpperCase().trim();
  return ["ANY", "AM", "PM"].includes(s) ? s : "ANY";
}

function safeText(v) {
  const s = String(v ?? "").trim();
  return s;
}

function stopKey(type, id) {
  return `${type}:${id}`;
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

    const runSlot = normSlot(run.route_slot);

    // ----------------------------
    // 1) SUBSCRIPTIONS due in run
    // ----------------------------
    let subsQ = supabase
      .from("subscriptions")
      .select(
        "id,address,postcode,extra_bags,use_own_bin,route_slot,ops_notes,next_collection_date,route_day,route_area,status"
      )
      .eq("status", "active")
      .eq("next_collection_date", run.run_date)
      .eq("route_day", run.route_day)
      .eq("route_area", run.route_area);

    if (runSlot !== "ANY") {
      // AM includes AM + ANY + blank
      // PM includes PM + ANY + blank
      subsQ = subsQ.or(`route_slot.eq.${runSlot},route_slot.eq.ANY,route_slot.is.null,route_slot.eq.""`);
    }

    const { data: subs, error: eSubs } = await subsQ
      .order("postcode", { ascending: true })
      .order("address", { ascending: true });

    if (eSubs) return res.status(500).json({ error: eSubs.message });

    // collected map for subs
    const subscriptionIds = (subs || []).map((s) => s.id);
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

    const subStops = (subs || []).map((s) => ({
      key: stopKey("subscription", s.id),
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

    // ----------------------------
    // 2) BOOKINGS due in run
    // ----------------------------
    // We only include bookings due on run date, for same day/area.
    // Slot filtering matches your slot logic:
    // - AM run includes booking AM + ANY + blank
    // - PM run includes booking PM + ANY + blank
    // - ANY run includes all
    let bookingsQ = supabase
      .from("bookings")
      .select(
        "id,title,service_date,postcode,address,route_day,route_area,route_slot,status,completed_at,total_pence,notes,payload"
      )
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
      const bSlot = b.route_slot || null;
      const isCompleted = String(b.status || "").toLowerCase() === "completed" || !!b.completed_at;

      // fallbacks if postcode/address stored in payload historically
      const payloadPostcode = safeText(b?.payload?.postcode);
      const payloadAddress = safeText(b?.payload?.address);

      return {
        key: stopKey("booking", b.id),
        type: "booking",
        id: b.id,

        title: safeText(b.title) || "Booking",
        address: safeText(b.address) || payloadAddress || "— address missing —",
        postcode: safeText(b.postcode) || payloadPostcode || "— postcode missing —",
        route_slot: bSlot,

        total_pence: Number(b.total_pence) || 0,
        notes: safeText(b.notes) || safeText(b?.payload?.notes) || null,

        collected: isCompleted,
      };
    });

    // ----------------------------
    // Combine stops + totals + warnings
    // ----------------------------
    const stops = [...subStops, ...bookingStops];

    // deterministic ordering (postcode -> address). We already ordered per-query,
    // but re-sort combined list to be safe.
    stops.sort((a, b) => {
      const ap = safeText(a.postcode).localeCompare(safeText(b.postcode));
      if (ap !== 0) return ap;
      const aa = safeText(a.address).localeCompare(safeText(b.address));
      if (aa !== 0) return aa;
      // subs before bookings if tie (doesn't really matter)
      return safeText(a.type).localeCompare(safeText(b.type));
    });

    const totals = {
      totalStops: stops.length,
      totalExtraBags: subStops.reduce((sum, s) => sum + (Number(s.extra_bags) || 0), 0),
      totalBookings: bookingStops.length,
      totalSubscriptions: subStops.length,
    };

    // Warnings (no silent magic)
    let warning = "";

    if (runSlot !== "ANY") {
      const blankSubSlots = subStops.filter((s) => !s.route_slot || safeText(s.route_slot) === "").length;
      const blankBookSlots = bookingStops.filter((s) => !s.route_slot || safeText(s.route_slot) === "").length;

      const parts = [];
      if (blankSubSlots > 0) {
        parts.push(
          `${blankSubSlots} subscription stop(s) have blank route_slot so they were included in ${runSlot}.`
        );
      }
      if (blankBookSlots > 0) {
        parts.push(`${blankBookSlots} booking stop(s) have blank route_slot so they were included in ${runSlot}.`);
      }
      if (parts.length) {
        warning = `${parts.join(" ")} Consider setting route_slot on those records.`;
      }
    }

    // Missing key fields warnings (bookings)
    const missingBookingAddr = bookingStops.filter((s) => String(s.address || "").includes("missing")).length;
    const missingBookingPc = bookingStops.filter((s) => String(s.postcode || "").includes("missing")).length;
    if (missingBookingAddr || missingBookingPc) {
      warning = [
        warning,
        `Bookings with missing fields: ${missingBookingPc} missing postcode, ${missingBookingAddr} missing address.`,
      ]
        .filter(Boolean)
        .join(" ");
    }

    return res.status(200).json({ run, stops, totals, warning });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load run" });
  }
}
