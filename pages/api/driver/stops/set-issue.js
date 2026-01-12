// pages/api/driver/stops/set-issue.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function normType(t) {
  const s = String(t || "").toLowerCase().trim();
  if (s === "booking" || s === "subscription") return s;
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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
      .select("id,name,email,active")
      .ilike("email", email)
      .maybeSingle();

    if (eStaff) return res.status(500).json({ error: eStaff.message });
    if (!staffRow) return res.status(403).json({ error: "No staff record for this email" });
    if (staffRow.active === false) return res.status(403).json({ error: "Staff is inactive" });

    const body = req.body || {};
    const run_id = String(body.run_id || "").trim();
    const stop_type = normType(body.stop_type);
    const stop_id = String(body.stop_id || "").trim();
    const reason = String(body.reason || "").trim();
    const details = String(body.details || "").trim();

    if (!run_id) return res.status(400).json({ error: "Missing run_id" });
    if (!stop_type) return res.status(400).json({ error: "Invalid stop_type (booking|subscription)" });
    if (!stop_id) return res.status(400).json({ error: "Missing stop_id" });
    if (!reason) return res.status(400).json({ error: "Missing reason" });

    // ensure driver is assigned to run
    const { data: linkRow, error: eLink } = await supabase
      .from("daily_run_staff")
      .select("run_id, staff_id")
      .eq("run_id", run_id)
      .eq("staff_id", staffRow.id)
      .maybeSingle();

    if (eLink) return res.status(500).json({ error: eLink.message });
    if (!linkRow) return res.status(403).json({ error: "You are not assigned to this run" });

    // upsert (unique index on run_id + stop_type + stop_id)
    const { error: eUpsert } = await supabase.from("run_stop_issues").upsert(
      {
        run_id,
        stop_type,
        stop_id,
        reason,
        details,
        created_by_staff_id: staffRow.id,
        resolved_at: null,
        resolved_by_staff_id: null,
      },
      { onConflict: "run_id,stop_type,stop_id" }
    );

    if (eUpsert) return res.status(500).json({ error: eUpsert.message });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to set issue" });
  }
}
