// pages/api/ops/day-summary.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function normSlot(s) {
  const x = String(s || "").trim().toUpperCase();
  if (x === "AM" || x === "PM" || x === "ANY") return x;
  return ""; // blank treated as blank
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const date = String(req.query.date || "").trim();
    if (!isValidYMD(date)) return res.status(400).json({ error: "Invalid date (YYYY-MM-DD)" });

    const supabaseAdmin = getSupabaseAdmin();

    // Pull all subs due that day. (We’ll add paused filtering if needed once we confirm your fields.)
    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("id, route_area, route_slot, next_collection_date, status")
      .eq("next_collection_date", date);

    if (error) throw new Error(error.message);

    const dueCounts = {};
    for (const s of data || []) {
      const area = String(s.route_area || "").trim();
      const slot = normSlot(s.route_slot || "ANY") || "ANY";
      if (!area) continue;
      const key = `${area}|${slot}`;
      dueCounts[key] = (dueCounts[key] || 0) + 1;
    }

    return res.status(200).json({ ok: true, date, dueCounts });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
