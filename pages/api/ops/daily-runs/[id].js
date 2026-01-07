// pages/api/ops/daily-runs/[id].js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const SLOTS = new Set(["ANY", "AM", "PM"]);
function normSlot(v) {
  const s = String(v || "ANY").toUpperCase().trim();
  return SLOTS.has(s) ? s : "ANY";
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method === "PUT") {
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

      const { error: eUpd } = await supabase
        .from("daily_runs")
        .update({ run_date, route_day, route_area, route_slot, vehicle_id, notes })
        .eq("id", id);

      if (eUpd) return res.status(500).json({ error: eUpd.message });

      // reset staff assignments (simple + reliable)
      const { error: eDel } = await supabase.from("daily_run_staff").delete().eq("daily_run_id", id);
      if (eDel) return res.status(500).json({ error: eDel.message });

      if (staff_ids.length) {
        const rows = staff_ids.map((sid) => ({ daily_run_id: id, staff_id: sid }));
        const { error: eIns } = await supabase.from("daily_run_staff").insert(rows);
        if (eIns) return res.status(500).json({ error: eIns.message });
      }

      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Save failed" });
    }
  }

  if (req.method === "DELETE") {
    try {
      // staff rows first
      const { error: eDelStaff } = await supabase.from("daily_run_staff").delete().eq("daily_run_id", id);
      if (eDelStaff) return res.status(500).json({ error: eDelStaff.message });

      const { error: eDelRun } = await supabase.from("daily_runs").delete().eq("id", id);
      if (eDelRun) return res.status(500).json({ error: eDelRun.message });

      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Delete failed" });
    }
  }

  res.setHeader("Allow", "PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
