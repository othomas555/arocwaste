// pages/api/ops/daily-runs.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const SLOTS = new Set(["ANY", "AM", "PM"]);

function normSlot(v) {
  const s = String(v || "ANY").toUpperCase().trim();
  return SLOTS.has(s) ? s : "ANY";
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  if (req.method === "GET") {
    try {
      const date = String(req.query.date || "").slice(0, 10);
      if (!date) return res.status(400).json({ error: "Missing date" });

      const { data, error } = await supabase
        .from("daily_runs")
        .select(
          `
          id, run_date, route_day, route_area, route_slot, vehicle_id, notes, created_at,
          vehicles:vehicles(id, registration, name),
          daily_run_staff:daily_run_staff(
            staff_id,
            staff:staff(id, name, role, active)
          )
        `
        )
        .eq("run_date", date)
        .order("created_at", { ascending: false });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ runs: data || [] });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed loading runs" });
    }
  }

  if (req.method === "POST") {
    try {
      const body = req.body || {};
      const run_date = String(body.run_date || "").slice(0, 10);
      const route_day = String(body.route_day || "");
      const route_area = String(body.route_area || "").trim();
      const route_slot = normSlot(body.route_slot);
      const vehicle_id = body.vehicle_id || null;
      const notes = String(body.notes || "");
      const staff_ids = Array.isArray(body.staff_ids) ? body.staff_ids : [];

      if (!run_date) return res.status(400).json({ error: "run_date required" });
      if (!route_day) return res.status(400).json({ error: "route_day required" });
      if (!route_area) return res.status(400).json({ error: "route_area required" });

      const { data: run, error: eRun } = await supabase
        .from("daily_runs")
        .insert([{ run_date, route_day, route_area, route_slot, vehicle_id, notes }])
        .select("id")
        .single();

      if (eRun) return res.status(500).json({ error: eRun.message });

      if (staff_ids.length) {
        const rows = staff_ids.map((sid) => ({ daily_run_id: run.id, staff_id: sid }));
        const { error: eStaff } = await supabase.from("daily_run_staff").insert(rows);
        if (eStaff) return res.status(500).json({ error: eStaff.message });
      }

      return res.status(200).json({ ok: true, id: run.id });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Create failed" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
