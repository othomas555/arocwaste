import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function getBearer(req) {
  const h = req.headers.authorization || "";
  const [t, v] = h.split(" ");
  if (t !== "Bearer" || !v) return null;
  return v;
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing run id" });

  const token = getBearer(req);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const url = process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return res.status(500).json({ error: "Supabase env missing" });

  // Verify the user via Supabase Auth using their bearer token
  const authClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid session" });

  const email = (userData.user.email || "").toLowerCase();
  if (!email) return res.status(401).json({ error: "User email missing" });

  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ error: "Supabase admin not configured" });

  // Map auth email -> staff row
  const { data: staff, error: staffErr } = await admin
    .from("staff")
    .select("id,name,email,role,active")
    .ilike("email", email)
    .maybeSingle();

  if (staffErr) return res.status(500).json({ error: staffErr.message });
  if (!staff) return res.status(403).json({ error: "No matching staff record for this email" });
  if (!staff.active) return res.status(403).json({ error: "Staff record inactive" });

  // Confirm staff is assigned to this run
  const { data: link, error: linkErr } = await admin
    .from("daily_run_staff")
    .select("run_id")
    .eq("run_id", id)
    .eq("staff_id", staff.id)
    .maybeSingle();

  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!link) return res.status(403).json({ error: "You are not assigned to this run" });

  // Load the run
  const { data: run, error: runErr } = await admin
    .from("daily_runs")
    .select(
      "id,run_date,route_day,route_area,vehicle_id,notes, vehicles(id,registration,name,capacity_units,active), daily_run_staff(staff(id,name,email,role,active))"
    )
    .eq("id", id)
    .single();

  if (runErr) return res.status(400).json({ error: runErr.message });

  const runDate = run.run_date; // YYYY-MM-DD
  const routeDay = run.route_day;
  const routeArea = run.route_area;

  if (!isYMD(runDate)) {
    return res.status(500).json({ error: "Run date invalid" });
  }

  // Stops due for this run
  const { data: subs, error: subsErr } = await admin
    .from("subscriptions")
    .select(
      "id,status,name,postcode,address,frequency,extra_bags,use_own_bin,route_day,route_area,next_collection_date,ops_notes"
    )
    .in("status", ["active", "trialing"])
    .eq("next_collection_date", runDate)
    .eq("route_day", routeDay)
    .eq("route_area", routeArea)
    .order("postcode", { ascending: true });

  if (subsErr) return res.status(500).json({ error: subsErr.message });

  const ids = (subs || []).map((s) => s.id);

  // Already-collected markers for that date
  let collectedSet = new Set();
  if (ids.length) {
    const { data: cols, error: colErr } = await admin
      .from("subscription_collections")
      .select("subscription_id,collected_date")
      .in("subscription_id", ids)
      .eq("collected_date", runDate);

    if (colErr) return res.status(500).json({ error: colErr.message });
    collectedSet = new Set((cols || []).map((c) => c.subscription_id));
  }

  const stops = (subs || []).map((s) => ({ ...s, collected: collectedSet.has(s.id) }));
  const totals = {
    totalStops: stops.length,
    totalExtraBags: stops.reduce((sum, s) => sum + (Number(s.extra_bags) || 0), 0),
  };

  return res.status(200).json({ staff, run, stops, totals });
}
