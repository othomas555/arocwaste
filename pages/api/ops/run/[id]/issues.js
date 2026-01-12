// pages/api/ops/run/[id]/issues.js
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  const runId = String(req.query.id || "").trim();
  if (!runId) return res.status(400).json({ error: "Missing run id" });

  try {
    const { data, error } = await supabase
      .from("run_stop_issues")
      .select("stop_type, stop_id, reason, details, created_at, created_by_staff_id")
      .eq("run_id", runId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, issues: data || [] });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load issues" });
  }
}
