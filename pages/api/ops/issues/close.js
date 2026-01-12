// pages/api/ops/issues/close.js
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
    const issue_id = String(body.issue_id || "").trim();
    const resolution_action = String(body.resolution_action || "").trim();
    const resolution_outcome = String(body.resolution_outcome || "").trim();

    if (!issue_id) return res.status(400).json({ error: "Missing issue_id" });
    if (!resolution_action) return res.status(400).json({ error: "Add an action note before closing." });

    const { error } = await supabase
      .from("run_stop_issues")
      .update({
        resolved_at: new Date().toISOString(),
        resolution_action,
        resolution_outcome,
      })
      .eq("id", issue_id);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to close issue" });
  }
}
