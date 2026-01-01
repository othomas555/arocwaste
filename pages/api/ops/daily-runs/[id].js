import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function normStr(s) {
  return (s || "").toString().trim();
}
function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Missing id" });
  }

  // PUT: update run fields AND replace staff assignment in one call
  if (req.method === "PUT") {
    try {
      const body = req.body || {};
      const patch = {};

      if (body.run_date !== undefined) {
        if (!isYMD(body.run_date)) return res.status(400).json({ error: "run_date must be YYYY-MM-DD" });
        patch.run_date = normStr(body.run_date);
      }
      if (body.route_day !== undefined) patch.route_day = normStr(body.route_day);
      if (body.route_area !== undefined) patch.route_area = normStr(body.route_area);
      if (body.vehicle_id !== undefined) patch.vehicle_id = body.vehicle_id ? normStr(body.vehicle_id) : null;
      if (body.notes !== undefined) patch.notes = (body.notes || "").toString();

      // Update run core fields (if any)
      if (Object.keys(patch).length) {
        const { error: upErr } = await supabase.from("daily_runs").update(patch).eq("id", id);
        if (upErr) return res.status(400).json({ error: upErr.message });
      }

      // Replace staff assignments if staff_ids provided
      if (body.staff_ids !== undefined) {
        const staff_ids = Array.isArray(body.staff_ids) ? body.staff_ids.map(normStr).filter(Boolean) : [];

        const { error: delErr } = await supabase.from("daily_run_staff").delete().eq("run_id", id);
        if (delErr) return res.status(400).json({ error: delErr.message });

        if (staff_ids.length) {
          const inserts = staff_ids.map((sid) => ({ run_id: id, staff_id: sid }));
          const { error: insErr } = await supabase.from("daily_run_staff").insert(inserts);
          if (insErr) return res.status(400).json({ error: insErr.message });
        }
      }

      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Server error" });
    }
  }

  if (req.method === "DELETE") {
    const { error } = await supabase.from("daily_runs").delete().eq("id", id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
