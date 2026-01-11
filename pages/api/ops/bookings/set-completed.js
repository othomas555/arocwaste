// pages/api/ops/bookings/set-completed.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  try {
    const body = req.body || {};
    const booking_id = String(body.booking_id || "").trim();
    const run_id = String(body.run_id || "").trim();
    const completed = !!body.completed;

    if (!booking_id) return res.status(400).json({ error: "Missing booking_id" });
    if (!run_id) return res.status(400).json({ error: "Missing run_id" });

    const patch = completed
      ? { completed_at: new Date().toISOString(), completed_by_run_id: run_id }
      : { completed_at: null, completed_by_run_id: null };

    const { error } = await supabase.from("bookings").update(patch).eq("id", booking_id);

    if (error) {
      return res.status(500).json({
        error: error.message,
        hint:
          "If this mentions missing columns completed_at/completed_by_run_id, add them to bookings (see SQL migration).",
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to update booking" });
  }
}
