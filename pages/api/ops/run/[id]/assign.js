// pages/api/ops/run/[id]/assign.js
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

function asUUID(v) {
  const s = String(v || "").trim();
  return s.length ? s : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing run id" });

  try {
    const body = req.body || {};
    const vehicle_id = asUUID(body.vehicle_id);
    const staff_ids = Array.isArray(body.staff_ids)
      ? body.staff_ids.map(asUUID).filter(Boolean)
      : [];

    // Update vehicle
    const { error: eRun } = await supabase
      .from("daily_runs")
      .update({ vehicle_id })
      .eq("id", id);

    if (eRun) return res.status(500).json({ error: eRun.message });

    // Replace staff assignments (simple, explicit)
    const { error: eDel } = await supabase
      .from("daily_run_staff")
      .delete()
      .eq("daily_run_id", id);

    if (eDel) return res.status(500).json({ error: eDel.message });

    if (staff_ids.length) {
      const rows = staff_ids.map((staff_id) => ({ daily_run_id: id, staff_id }));
      const { error: eIns } = await supabase.from("daily_run_staff").insert(rows);
      if (eIns) return res.status(500).json({ error: eIns.message });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to assign run" });
  }
}
