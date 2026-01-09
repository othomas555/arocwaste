// pages/api/ops/daily-runs/ensure.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SLOTS = ["ANY", "AM", "PM", ""]; // allow blank

function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = req.body || {};

    const run_date = String(body.run_date || "").trim();
    const route_day = String(body.route_day || "").trim();
    const route_area = String(body.route_area || "").trim();
    const route_slot = String(body.route_slot || "ANY").trim().toUpperCase();

    if (!isValidYMD(run_date)) return res.status(400).json({ error: "Invalid run_date (YYYY-MM-DD)" });
    if (!ALL_DAYS.includes(route_day)) return res.status(400).json({ error: "Invalid route_day" });
    if (!route_area) return res.status(400).json({ error: "Missing route_area" });
    if (!SLOTS.includes(route_slot)) return res.status(400).json({ error: "Invalid route_slot" });

    // 1) Try to find existing
    const { data: existing, error: findErr } = await supabaseAdmin
      .from("daily_runs")
      .select("id, run_date, route_day, route_area, route_slot")
      .eq("run_date", run_date)
      .eq("route_day", route_day)
      .eq("route_area", route_area)
      .eq("route_slot", route_slot === "" ? null : route_slot)
      .maybeSingle();

    if (findErr) throw new Error(findErr.message);
    if (existing?.id) {
      return res.status(200).json({ ok: true, created: false, run: existing });
    }

    // 2) Create new
    const insertRow = {
      run_date,
      route_day,
      route_area,
      route_slot: route_slot === "" ? null : route_slot,
    };

    const { data: created, error: insErr } = await supabaseAdmin
      .from("daily_runs")
      .insert(insertRow)
      .select("id, run_date, route_day, route_area, route_slot")
      .single();

    if (insErr) {
      // If you have a unique constraint and we raced, re-fetch
      const { data: existing2, error: findErr2 } = await supabaseAdmin
        .from("daily_runs")
        .select("id, run_date, route_day, route_area, route_slot")
        .eq("run_date", run_date)
        .eq("route_day", route_day)
        .eq("route_area", route_area)
        .eq("route_slot", route_slot === "" ? null : route_slot)
        .maybeSingle();

      if (findErr2) throw new Error(insErr.message);
      if (existing2?.id) return res.status(200).json({ ok: true, created: false, run: existing2 });

      throw new Error(insErr.message);
    }

    return res.status(200).json({ ok: true, created: true, run: created });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
