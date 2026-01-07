// pages/api/ops/run/[id].js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function normSlot(v) {
  const s = String(v || "ANY").toUpperCase().trim();
  return ["ANY", "AM", "PM"].includes(s) ? s : "ANY";
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
    // Load run
    const { data: run, error: eRun } = await supabase
      .from("daily_runs")
      .select(
        `
        id, run_date, route_day, route_area, route_slot, vehicle_id, notes,
        vehicles:vehicles(id, registration, name),
        daily_run_staff:daily_run_staff(
          id,
          staff:staff(id, name, role, active)
        )
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (eRun) return res.status(500).json({ error: eRun.message });
    if (!run) return res.status(404).json({ error: "Run not found" });

    const runSlot = normSlot(run.route_slot);

    // Stops = subscriptions due on run_date and matching area/day (and slot rules)
    let q = supabase
      .from("subscriptions")
      .select(
        "id,address,postcode,extra_bags,use_own_bin,route_slot,ops_notes,next_collection_date,route_day,route_area,status"
      )
      .eq("status", "active")
      .eq("next_collection_date", run.run_date)
      .eq("route_day", run.route_day)
      .eq("route_area", run.route_area);

    // Slot matching:
    // - ANY run => no extra filter
    // - AM/PM run => include route_slot = runSlot OR ANY OR null OR empty
    if (runSlot !== "ANY") {
      q = q.or(`route_slot.eq.${runSlot},route_slot.eq.ANY,route_slot.is.null,route_slot.eq.""`);
    }

    const { data: subs, error: eSubs } = await q.order("postcode", { ascending: true });

    if (eSubs) return res.status(500).json({ error: eSubs.message });

    const subscriptionIds = (subs || []).map((s) => s.id);

    // Get collected states for this run date
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

    const stops = (subs || []).map((s) => ({
      ...s,
      collected: !!collectedMap.get(s.id),
    }));

    const totals = {
      totalStops: stops.length,
      totalExtraBags: stops.reduce((sum, s) => sum + (Number(s.extra_bags) || 0), 0),
    };

    // Helpful warning if lots of blanks on slot when run is AM/PM
    let warning = "";
    if (runSlot !== "ANY") {
      const blanks = stops.filter((s) => !s.route_slot || String(s.route_slot).trim() === "").length;
      if (blanks > 0) {
        warning = `Note: ${blanks} stop(s) have blank route_slot so they were included in ${runSlot}. Consider setting route_slot on those subscribers.`;
      }
    }

    return res.status(200).json({ run, stops, totals, warning });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load run" });
  }
}
