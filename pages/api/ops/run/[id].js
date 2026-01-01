import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Missing run id" });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1) Load run
    const { data: run, error: runErr } = await supabase
      .from("daily_runs")
      .select(
        "id,run_date,route_day,route_area,vehicle_id,notes, vehicles(id,registration,name,capacity_units,active), daily_run_staff(staff(id,name,email,role,active))"
      )
      .eq("id", id)
      .single();

    if (runErr) return res.status(400).json({ error: runErr.message });

    // 2) Load due subscriptions for this run
    // Assumptions based on your current ops/today behaviour:
    // - only active/trialing appear
    // - due if next_collection_date == run_date
    // - match route_day + route_area as stored on subscription (rule-driven or overridden)
    const runDate = run.run_date; // YYYY-MM-DD (date)
    const routeDay = run.route_day;
    const routeArea = run.route_area;

    const { data: subs, error: subsErr } = await supabase
      .from("subscriptions")
      .select(
        "id,status,name,email,phone,postcode,address,frequency,extra_bags,use_own_bin,route_day,route_area,next_collection_date,ops_notes"
      )
      .in("status", ["active", "trialing"])
      .eq("next_collection_date", runDate)
      .eq("route_day", routeDay)
      .eq("route_area", routeArea)
      .order("postcode", { ascending: true });

    if (subsErr) return res.status(500).json({ error: subsErr.message });

    const subscriptionIds = (subs || []).map((s) => s.id);

    // 3) Load collections recorded for that date
    let collectedSet = new Set();
    if (subscriptionIds.length) {
      // We don’t know your exact column names, but based on your description:
      // subscription_collections is written to when collected/undo
      // We'll fetch by run_date and subscription_id.
      const { data: cols, error: colErr } = await supabase
        .from("subscription_collections")
        .select("subscription_id,collection_date")
        .in("subscription_id", subscriptionIds)
        .eq("collection_date", runDate);

      // If your column is not collection_date, this will error — and we’ll adjust fast.
      if (colErr) {
        // Return run + subs anyway so ops can still work.
        return res.status(200).json({
          run,
          stops: (subs || []).map((s) => ({ ...s, collected: false })),
          warning: `Could not load collection markers: ${colErr.message}`,
        });
      }

      collectedSet = new Set((cols || []).map((c) => c.subscription_id));
    }

    const stops = (subs || []).map((s) => ({
      ...s,
      collected: collectedSet.has(s.id),
    }));

    const totalStops = stops.length;
    const totalExtraBags = stops.reduce((sum, s) => sum + (Number(s.extra_bags) || 0), 0);

    return res.status(200).json({
      run,
      stops,
      totals: { totalStops, totalExtraBags },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
