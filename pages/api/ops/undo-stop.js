// pages/api/ops/undo-stop.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  try {
    const body = req.body || {};
    const type = String(body.type || "").trim();
    const id = String(body.id || "").trim();
    const date = String(body.date || "").trim();

    if (!type || !id || !date) return res.status(400).json({ error: "Missing type/id/date" });

    if (type === "subscription") {
      const { error } = await supabase
        .from("subscription_collections")
        .delete()
        .eq("subscription_id", id)
        .eq("collected_date", date);

      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (type === "booking") {
      const { error } = await supabase
        .from("bookings")
        .update({
          status: "booked",
          completed_at: null,
        })
        .eq("id", id);

      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Invalid type" });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to undo stop" });
  }
}
