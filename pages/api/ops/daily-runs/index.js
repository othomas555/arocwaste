import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function normStr(s) {
  return (s || "").toString().trim();
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  // GET /api/ops/daily-runs?date=YYYY-MM-DD
  if (req.method === "GET") {
    try {
      const date = req.query?.date;
      if (date && !isYMD(date)) {
        return res.status(400).json({ error: "date must be YYYY-MM-DD" });
      }

      let q = supabase
        .from("daily_runs")
        .select(
          "id,run_date,route_day,route_area,vehicle_id,notes,created_at,updated_at, vehicles(id,registration,name,capacity_units,active), daily_run_staff(staff(id,name,email,role,active))"
        )
        .order("route_area", { ascending: true });

      if (date) q = q.eq("run_date", date);

      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({ runs: data || [] });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Server error" });
    }
  }

  // POST /api/ops/daily-runs
  if (req.method === "POST") {
    try {
      const body = req.body || {};
      const run_date = normStr(body.run_date);
      const route_day = normStr(body.route_day);
      const route_area = normStr(body.route_area);
      const vehicle_id = body.vehicle_id ? normStr(body.vehicle_id) : null;
      const notes = (body.notes || "").toString();
      const staff_ids = Array.isArray(body.staff_ids) ? body.staff_ids.map(normStr).filter(Boolean) : [];

      if (!isYMD(run_date)) return res.status(400).json({ error: "run_date must be YYYY-MM-DD" });
      if (!route_day) return res.status(400).json({ error: "route_day is required" });
      if (!route_area) return res.status(400).json({ error: "route_area is required" });

      const { data: runData, error: runErr } = await supabase
        .from("daily_runs")
        .insert([{ run_date, route_day, route_area, vehicle_id, notes }])
        .select("id")
        .single();

      if (runErr) return res.status(400).json({ error: runErr.message });

      const run_id = runData.id;

      if (staff_ids.length) {
        const inserts = staff_ids.map((sid) => ({ run_id, staff_id: sid }));
        const { error: staffErr } = await supabase.from("daily_run_staff").insert(inserts);
        if (staffErr) return res.status(400).json({ error: staffErr.message });
      }

      return res.status(200).json({ ok: true, id: run_id });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Server error" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
