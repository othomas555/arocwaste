// pages/api/ops/issues/count-open.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  try {
    const { count, error } = await supabase
      .from("run_stop_issues")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, open_count: count || 0 });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to count issues" });
  }
}
