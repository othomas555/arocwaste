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

function safeItems(payload) {
  try {
    const items = payload?.items;
    if (!Array.isArray(items)) return [];
    return items
      .map((x) => ({
        title: String(x?.title || "").trim(),
        qty: Number(x?.qty || x?.quantity || 1) || 1,
      }))
      .filter((x) => x.title);
  } catch {
    return [];
  }
}

function safeItemsSummary(payload) {
  const items = safeItems(payload);
  if (!items.length) return "";
  const parts = items.slice(0, 3).map((x) => `${x.title}${x.qty > 1 ? ` ×${x.qty}` : ""}`);
  const suffix = items.length > 3 ? ` + ${items.length - 3} more` : "";
  return parts.join(", ") + suffix;
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
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid session" });

    const email = String(userData.user.email || "").trim().toLowerCase();
    if (!email) return res.status(401).json({ error: "No email on session" });

    const { data: staffRow, error: eStaff } = await supabase
      .from("staff")
      .select("id,name,email,role,active")
      .ilike("email", email)
      .maybeSingle();

    if (eStaff) return res.status(500).json({ error: eStaff.message });
    if (!staffRow) return res.status(403).json({ error: "No staff record for this email" });
    if (staffRow.active === false) return res.status(403).json({ error: "Staff is inactive" });

    const { data: linkRow, error: eLink } = await supabase
      .from("daily_run_staff")
      .select("run_id, staff_id")
      .eq("run_id", runId)
      .eq("staff_id", staffRow.id)
      .maybeSingle();

    if (eLink) return res.status(500).json({ error: eLink.message });
    if (!linkRow) return res.status(403).json({ error: "You are not assigned to this run" });

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
        stop_order,
        vehicles:vehicles(id, registration, name)
      `
      )
      .eq("id", runId)
      .maybeSingle();

    if (eRun) return res.status(500).json({ error: eRun.message });
    if (!run) return res.status(404).json({ error: "Run not found" });

    const runSlot = normSlot(run.route_slot);

    // --- SUBSCRIPTIONS (unchanged, with slot rules enforced in JS)
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

    if (runSlot !== "ANY") {
      subsQuery = subsQuery.or(`route_slot.eq.${runSlot},route_slot.eq.ANY,route_slot.is.null,route_slot.eq.""`);
    }

    const { data: subs, error: eSubs } = await subsQuery;
    if (eSubs) return res.status(500).json({ error: eSubs.message });

    const dueSubs = (subs || [])
      .filter((s) => matchesRunSlot(runSlot, s.route_slot))
      .filter((s) => isDueOnDate(run.run_date, s.anchor_date, s.frequency));

    const dueIds = dueSubs.map((s) => s.id);

    let collectedSet = new Set();
    if (dueIds.length) {
      const { data: collectedRows, error: eCollected } = await supabase
        .from("subscription_collections")
        .select("subscription_id")
        .eq("collected_date", run.run_date)
        .in("subscription_id", dueIds);

      if (eCollected) return res.status(500).json({ error: eCollected.message });
      for (const r of collectedRows || []) if (r?.subscription_id) collectedSet.add(r.subscription_id);
    }

    const stops = dueSubs.map((s) => ({
      type: "subscription",
      id: s.id,
      address: s.address || "",
      postcode: s.postcode || "",
      extra_bags: s.extra_bags || 0,
      use_own_bin: !!s.use_own_bin,
      ops_notes: s.ops_notes || "",
      collected: collectedSet.has(s.id),
    }));

    // --- BOOKINGS (expanded details)
    let bq = supabase
      .from("bookings")
      .select(
        "id, booking_ref, service_date, collection_date, route_area, route_day, route_slot, status, payment_status, name, email, phone, postcode, address, notes, total_pence, payload, completed_at, completed_by_run_id"
      )
      .eq("route_area", run.route_area)
      .eq("route_day", run.route_day)
      .or(`service_date.eq.${run.run_date},collection_date.eq.${run.run_date}`)
      .neq("status", "cancelled");

    if (runSlot !== "ANY") {
      bq = bq.or(`route_slot.eq.${runSlot},route_slot.eq.ANY,route_slot.is.null,route_slot.eq.""`);
    }

    const { data: bookingsRaw, error: eBookings } = await bq;
    if (eBookings) {
      return res.status(500).json({
        error: eBookings.message,
        hint:
          "If this mentions missing columns (stop_order/completed_at/etc.) run the SQL migrations.",
      });
    }

    const bookings = (bookingsRaw || [])
      .filter((b) => matchesRunSlot(runSlot, b.route_slot))
      .map((b) => ({
        type: "booking",
        id: b.id,
        booking_ref: b.booking_ref,
        route_slot: b.route_slot,
        postcode: b.postcode || "",
        address: b.address || "",
        notes: b.notes || "",
        name: b.name || "",
        email: b.email || "",
        phone: b.phone || "",
        total_pence: b.total_pence,
        payment_status: b.payment_status,
        items: safeItems(b.payload),
        items_summary: safeItemsSummary(b.payload),
        completed_at: b.completed_at,
        completed_by_run_id: b.completed_by_run_id,
        completed: !!b.completed_at,
      }));

    // --- Apply saved run order (stop_order) if present
    // stop_order should be an array like: [{type:"booking", id:"..."}, {type:"subscription", id:"..."}]
    const stopOrder = Array.isArray(run.stop_order) ? run.stop_order : [];
    if (stopOrder.length) {
      const subMap = new Map(stops.map((x) => [x.id, x]));
      const bookMap = new Map(bookings.map((x) => [x.id, x]));
      const orderedBookings = [];
      const orderedStops = [];
      const seen = new Set();

      for (const o of stopOrder) {
        const t = String(o?.type || "");
        const oid = String(o?.id || "");
        if (!t || !oid) continue;
        const key = `${t}:${oid}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (t === "booking" && bookMap.has(oid)) orderedBookings.push(bookMap.get(oid));
        if (t === "subscription" && subMap.has(oid)) orderedStops.push(subMap.get(oid));
      }

      // append any new items not in the saved order
      for (const b of bookings) if (!seen.has(`booking:${b.id}`)) orderedBookings.push(b);
      for (const s of stops) if (!seen.has(`subscription:${s.id}`)) orderedStops.push(s);

      // overwrite
      bookings.length = 0;
      bookings.push(...orderedBookings);
      stops.length = 0;
      stops.push(...orderedStops);
    } else {
      // default sort
      bookings.sort((a, b) => String(a.postcode || "").localeCompare(String(b.postcode || "")));
      stops.sort((a, b) => String(a.postcode || "").localeCompare(String(b.postcode || "")));
    }

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
