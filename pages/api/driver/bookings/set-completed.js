// pages/api/driver/bookings/set-completed.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
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
    const body = req.body || {};
    const booking_id = String(body.booking_id || "").trim();
    const run_id = String(body.run_id || "").trim();
    const completed = !!body.completed;

    if (!booking_id) return res.status(400).json({ error: "Missing booking_id" });
    if (!run_id) return res.status(400).json({ error: "Missing run_id" });

    // 1) Validate session -> email
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid session" });

    const email = String(userData.user.email || "").trim().toLowerCase();
    if (!email) return res.status(401).json({ error: "No email on session" });

    // 2) Staff lookup
    const { data: staffRow, error: eStaff } = await supabase
      .from("staff")
      .select("id,email,active")
      .ilike("email", email)
      .maybeSingle();

    if (eStaff) return res.status(500).json({ error: eStaff.message });
    if (!staffRow) return res.status(403).json({ error: "No staff record for this email" });
    if (staffRow.active === false) return res.status(403).json({ error: "Staff is inactive" });

    // 3) Confirm staff assigned to run
    const { data: linkRow, error: eLink } = await supabase
      .from("daily_run_staff")
      .select("run_id, staff_id")
      .eq("run_id", run_id)
      .eq("staff_id", staffRow.id)
      .maybeSingle();

    if (eLink) return res.status(500).json({ error: eLink.message });
    if (!linkRow) return res.status(403).json({ error: "You are not assigned to this run" });

    const patch = completed
      ? {}
      : { completed_at: null, completed_by_run_id: null };

    if (completed) {
      patch.completed_at = new Date().toISOString();
      patch.completed_by_run_id = run_id;
    }

    const { error: eUp } = await supabase.from("bookings").update(patch).eq("id", booking_id);

    if (eUp) {
      return res.status(500).json({
        error: eUp.message,
        hint:
          "If this mentions missing columns completed_at/completed_by_run_id, add them to bookings (SQL migration).",
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to update booking" });
  }
}
