import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
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

    const dateFrom = String(req.query.date_from || "").trim(); // optional YYYY-MM-DD
    const dateTo = String(req.query.date_to || "").trim(); // optional YYYY-MM-DD

    let q = supabase
      .from("daily_run_staff")
      .select(
        `
        daily_run_id,
        daily_runs:daily_runs(
          id, run_date, route_day, route_area, route_slot, vehicle_id, notes, created_at,
          vehicles:vehicles(id, registration, name)
        )
      `
      )
      .eq("staff_id", staffRow.id);

    // optional date filtering
    if (dateFrom) q = q.gte("daily_runs.run_date", dateFrom);
    if (dateTo) q = q.lte("daily_runs.run_date", dateTo);

    const { data: rows, error: eRuns } = await q;
    if (eRuns) return res.status(500).json({ error: eRuns.message });

    const runs = (rows || [])
      .map((r) => r.daily_runs)
      .filter(Boolean)
      .sort((a, b) => String(a.run_date || "").localeCompare(String(b.run_date || "")));

    return res.status(200).json({
      ok: true,
      staff: { id: staffRow.id, name: staffRow.name, email: staffRow.email, role: staffRow.role },
      runs,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load driver runs" });
  }
}
