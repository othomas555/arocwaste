import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  const runId = String(req.query.id || "").trim();
  if (!runId) return res.status(400).json({ error: "Missing run id" });

  const body = req.body || {};
  const staffIds = Array.isArray(body.staff_ids) ? body.staff_ids : [];

  // normalize + de-dupe
  const cleaned = Array.from(
    new Set(
      staffIds
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  );

  try {
    // Ensure run exists
    const { data: run, error: eRun } = await supabase
      .from("daily_runs")
      .select("id")
      .eq("id", runId)
      .maybeSingle();

    if (eRun) return res.status(500).json({ error: eRun.message });
    if (!run) return res.status(404).json({ error: "Run not found" });

    // Delete existing assignments for this run
    const { error: eDel } = await supabase
      .from("daily_run_staff")
      .delete()
      .eq("daily_run_id", runId);

    if (eDel) return res.status(500).json({ error: eDel.message });

    // Insert new assignments (if any)
    if (cleaned.length) {
      const rows = cleaned.map((staff_id) => ({ daily_run_id: runId, staff_id }));
      const { error: eIns } = await supabase.from("daily_run_staff").insert(rows);
      if (eIns) return res.status(500).json({ error: eIns.message });
    }

    return res.status(200).json({ ok: true, run_id: runId, staff_ids: cleaned });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to assign staff" });
  }
}
