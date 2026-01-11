// pages/api/ops/run/[id]/optimize-order.js
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
  // UK-friendly: include postcode to help geocode
  return `${a}${p ? `, ${p}` : ""}, UK`;
}

async function googleOptimize({ apiKey, origin, destination, waypoints }) {
  const wp = waypoints.map((w) => `via:${encodeURIComponent(w)}`).join("|");
  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination || origin)}` +
    `&waypoints=optimize:true|${wp}` +
    `&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Directions failed (${res.status})`);
  if (json.status !== "OK") throw new Error(`Google Directions status: ${json.status} ${json.error_message || ""}`.trim());
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
    const origin = String(body.origin || "").trim();
    const destination = String(body.destination || "").trim();

    if (!origin) {
      return res.status(400).json({
        error: "Missing origin. Provide { origin: 'your depot address, postcode' }",
      });
    }

    const { data: run, error: eRun } = await supabase
      .from("daily_runs")
      .select("id, run_date, route_day, route_area, route_slot")
      .eq("id", runId)
      .maybeSingle();

    if (eRun) return res.status(500).json({ error: eRun.message });
    if (!run) return res.status(404).json({ error: "Run not found" });

    const runSlot = normSlot(run.route_slot);

    // Load candidate subscriptions (simple filter; slot rule enforced in JS)
    const { data: subs, error: eSubs } = await supabase
      .from("subscriptions")
      .select("id,address,postcode,route_slot,status,route_area,route_day,frequency,anchor_date")
      .eq("status", "active")
      .eq("route_area", run.route_area)
      .eq("route_day", run.route_day);

    if (eSubs) return res.status(500).json({ error: eSubs.message });

    // NOTE: we won't re-implement the full “due” logic here to keep it minimal;
    // we only order what is currently in the run payload.
    // So: call the run API logic indirectly by re-querying bookings and using slot filters + date match.
    // (Subscriptions “due” ordering can be added later if needed.)
    const subsCandidates = (subs || []).filter((s) => matchesRunSlot(runSlot, s.route_slot));

    const { data: bookingsRaw, error: eBookings } = await supabase
      .from("bookings")
      .select("id,address,postcode,route_slot,route_area,route_day,service_date,collection_date,status")
      .eq("route_area", run.route_area)
      .eq("route_day", run.route_day)
      .or(`service_date.eq.${run.run_date},collection_date.eq.${run.run_date}`)
      .neq("status", "cancelled");

    if (eBookings) return res.status(500).json({ error: eBookings.message });

    const bookings = (bookingsRaw || []).filter((b) => matchesRunSlot(runSlot, b.route_slot));

    // Build unified stop list for routing (bookings first then subs)
    const all = [
      ...bookings.map((b) => ({ type: "booking", id: b.id, address: b.address, postcode: b.postcode })),
      ...subsCandidates.map((s) => ({ type: "subscription", id: s.id, address: s.address, postcode: s.postcode })),
    ].filter((x) => fullStopAddress(x));

    if (all.length < 2) {
      // Not enough points to optimize
      const stop_order = all.map((x) => ({ type: x.type, id: x.id }));
      await supabase.from("daily_runs").update({ stop_order }).eq("id", runId);
      return res.status(200).json({ ok: true, stop_order, note: "Not enough stops to optimize. Saved basic order." });
    }

    // Google supports up to 23 waypoints on standard Directions (origin + destination + 23 waypoints).
    // Keep it safe:
    const MAX_WAYPOINTS = 23;
    const sliced = all.slice(0, MAX_WAYPOINTS);

    const waypoints = sliced.map((x) => fullStopAddress(x));
    const wpOrder = await googleOptimize({
      apiKey,
      origin,
      destination: destination || origin,
      waypoints,
    });

    // wpOrder gives indices into `waypoints` (and therefore `sliced`)
    const stop_order = wpOrder.map((idx) => ({ type: sliced[idx].type, id: sliced[idx].id }));

    // If we truncated due to waypoint limits, append remainder at end (unsorted)
    for (const x of all.slice(MAX_WAYPOINTS)) {
      stop_order.push({ type: x.type, id: x.id });
    }

    const { error: eSave } = await supabase.from("daily_runs").update({ stop_order }).eq("id", runId);
    if (eSave) return res.status(500).json({ error: eSave.message });

    return res.status(200).json({ ok: true, stop_order, truncated: all.length > MAX_WAYPOINTS });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to optimize route" });
  }
}
