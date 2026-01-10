import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function parseYMD(ymd) {
  // ymd like "2026-01-10"
  const s = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  // Use UTC to avoid timezone drift
  return new Date(Date.UTC(y, m - 1, d));
}

function daysBetweenUTC(a, b) {
  // b - a in whole days
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000);
}

function periodDaysForFrequency(freq) {
  const f = String(freq || "").toLowerCase();
  if (f === "weekly") return 7;
  if (f === "fortnightly") return 14;
  if (f === "threeweekly") return 21;
  return null;
}

function isDueOnDate(runDateYMD, anchorDateYMD, frequency) {
  const runDate = parseYMD(runDateYMD);
  const anchorDate = parseYMD(anchorDateYMD);
  const period = periodDaysForFrequency(frequency);

  if (!runDate || !anchorDate || !period) return false;

  const diff = daysBetweenUTC(anchorDate, runDate);
  if (diff < 0) return false;

  return diff % period === 0;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const runId = String(req.query.id || "").trim();
  if (!runId) return res.status(400).json({ error: "Missing run id" });

  try {
    // 1) Validate session -> email
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid session" });

    const email = String(userData.user.email || "").trim().toLowerCase();
    if (!email) return res.status(401).json({ error: "No email on session" });

    // 2) Staff lookup
    const { data: staffRow, error: eStaff } = await supabase
      .from("staff")
      .select("id,name,email,role,active")
      .ilike("email", email)
      .maybeSingle();

    if (eStaff) return res.status(500).json({ error: eStaff.message });
    if (!staffRow) return res.status(403).json({ error: "No staff record for this email" });
    if (staffRow.active === false) return res.status(403).json({ error: "Staff is inactive" });

    // 3) Confirm this staff member is assigned to this run
    // IMPORTANT: join table column is run_id (NOT daily_run_id)
    const { data: linkRow, error: eLink } = await supabase
      .from("daily_run_staff")
      .select("run_id, staff_id")
      .eq("run_id", runId)
      .eq("staff_id", staffRow.id)
      .maybeSingle();

    if (eLink) return res.status(500).json({ error: eLink.message });
    if (!linkRow) return res.status(403).json({ error: "You are not assigned to this run" });

    // 4) Load the run
    const { data: run, error: eRun } = await supabase
      .from("daily_runs")
      .select(
        `
        id,
        run_date,
        route_day,
        route_area,
        route_slot,
        vehicle_id,
        notes,
        created_at,
        vehicles:vehicles(id, registration, name)
      `
      )
      .eq("id", runId)
      .maybeSingle();

    if (eRun) return res.status(500).json({ error: eRun.message });
    if (!run) return res.status(404).json({ error: "Run not found" });

    // 5) Load candidate subscriptions for this run area/day/slot
    // Slot rules:
    // - If run is ANY -> include all
    // - If run is AM/PM -> include matching slot + ANY + blank
    let subsQuery = supabase
      .from("subscriptions")
      .select(
        `
        id,
        address,
        postcode,
        extra_bags,
        use_own_bin,
        ops_notes,
        status,
        route_area,
        route_day,
        route_slot,
        frequency,
        anchor_date
      `
      )
      .eq("status", "active")
      .eq("route_area", run.route_area)
      .eq("route_day", run.route_day);

    const runSlot = String(run.route_slot || "ANY").toUpperCase();
    if (runSlot !== "ANY") {
      // include route_slot = runSlot OR ANY OR null/empty
      subsQuery = subsQuery.in("route_slot", [runSlot, "ANY", "any", "", null]);
    }

    const { data: subs, error: eSubs } = await subsQuery;
    if (eSubs) return res.status(500).json({ error: eSubs.message });

    // 6) Filter due by anchor_date + frequency for this run date
    const dueSubs = (subs || []).filter((s) =>
      isDueOnDate(run.run_date, s.anchor_date, s.frequency)
    );

    const dueIds = dueSubs.map((s) => s.id);

    // 7) Collected flags for this run date
    // NOTE: This assumes your existing collections table is named "subscription_collections"
    // with columns: subscription_id, collected_date (you previously confirmed those headers).
    let collectedSet = new Set();
    if (dueIds.length) {
      const { data: collectedRows, error: eCollected } = await supabase
        .from("subscription_collections")
        .select("subscription_id")
        .eq("collected_date", run.run_date)
        .in("subscription_id", dueIds);

      if (eCollected) return res.status(500).json({ error: eCollected.message });

      for (const r of collectedRows || []) {
        if (r?.subscription_id) collectedSet.add(r.subscription_id);
      }
    }

    // 8) Shape stops payload expected by the driver page
    const stops = dueSubs
      .map((s) => ({
        id: s.id, // the page uses this as "subscription_id" when marking collected
        address: s.address || "",
        postcode: s.postcode || "",
        extra_bags: s.extra_bags || 0,
        use_own_bin: !!s.use_own_bin,
        ops_notes: s.ops_notes || "",
        collected: collectedSet.has(s.id),
      }))
      .sort((a, b) => String(a.postcode || "").localeCompare(String(b.postcode || "")));

    const totals = {
      totalStops: stops.length,
      totalExtraBags: stops.reduce((sum, s) => sum + (Number(s.extra_bags) || 0), 0),
    };

    return res.status(200).json({
      ok: true,
      staff: { id: staffRow.id, name: staffRow.name, email: staffRow.email, role: staffRow.role },
      run,
      stops,
      totals,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load driver run" });
  }
}
