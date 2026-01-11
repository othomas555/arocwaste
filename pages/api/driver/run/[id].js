import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function parseYMD(ymd) {
  const s = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function daysBetweenUTC(a, b) {
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

    const runSlot = normSlot(run.route_slot);

    // 5) Load candidate subscriptions for this run area/day/slot
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

    // Keep the DB filter simple; exact slot rules are enforced in JS via matchesRunSlot
    if (runSlot !== "ANY") {
      subsQuery = subsQuery.or(`route_slot.eq.${runSlot},route_slot.eq.ANY,route_slot.is.null,route_slot.eq.""`);
    }

    const { data: subs, error: eSubs } = await subsQuery;
    if (eSubs) return res.status(500).json({ error: eSubs.message });

    // 6) Filter due by anchor_date + frequency for this run date
    const dueSubs = (subs || [])
      .filter((s) => matchesRunSlot(runSlot, s.route_slot))
      .filter((s) => isDueOnDate(run.run_date, s.anchor_date, s.frequency));

    const dueIds = dueSubs.map((s) => s.id);

    // 7) Collected flags for this run date
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
        id: s.id, // subscription_id
        address: s.address || "",
        postcode: s.postcode || "",
        extra_bags: s.extra_bags || 0,
        use_own_bin: !!s.use_own_bin,
        ops_notes: s.ops_notes || "",
        collected: collectedSet.has(s.id),
      }))
      .sort((a, b) => String(a.postcode || "").localeCompare(String(b.postcode || "")));

    // ----------------------------
    // 9) BOOKINGS (new)
    // ----------------------------
    // Match by:
    // - route_area == run.route_area
    // - route_day == run.route_day (keeps consistent with ops)
    // - service_date == run.run_date OR collection_date (text) == run.run_date
    // - slot rules: ANY includes all; AM/PM include ANY + blank
    let bq = supabase
      .from("bookings")
      .select(
        "id, booking_ref, service_date, collection_date, route_area, route_day, route_slot, status, payment_status, name, phone, postcode, address, notes, total_pence, payload, completed_at, completed_by_run_id"
      )
      .eq("route_area", run.route_area)
      .eq("route_day", run.route_day)
      .or(`service_date.eq.${run.run_date},collection_date.eq.${run.run_date}`)
      .neq("status", "cancelled");

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
          "If this mentions missing columns completed_at/completed_by_run_id, add them to bookings (SQL migration).",
      });
    }

    const bookings = (bookingsRaw || [])
      .filter((b) => matchesRunSlot(runSlot, b.route_slot))
      .map((b) => ({
        id: b.id,
        booking_ref: b.booking_ref,
        route_slot: b.route_slot,
        postcode: b.postcode || "",
        address: b.address || "",
        notes: b.notes || "",
        phone: b.phone || "",
        total_pence: b.total_pence,
        payment_status: b.payment_status,
        items_summary: safeItemsSummary(b.payload),
        completed_at: b.completed_at,
        completed_by_run_id: b.completed_by_run_id,
        completed: !!b.completed_at,
      }));

    const totals = {
      totalStops: stops.length,
      totalExtraBags: stops.reduce((sum, s) => sum + (Number(s.extra_bags) || 0), 0),
      totalBookings: bookings.length,
      totalCompletedBookings: bookings.reduce((sum, b) => sum + (b.completed ? 1 : 0), 0),
    };

    return res.status(200).json({
      ok: true,
      staff: { id: staffRow.id, name: staffRow.name, email: staffRow.email, role: staffRow.role },
      run,
      stops,
      bookings,
      totals,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load driver run" });
  }
}
