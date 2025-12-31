import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { subscription_id } = req.body || {};

    if (!subscription_id) return res.status(400).json({ error: "Missing subscription_id" });

    // Find most recent collection for this subscription
    const { data: last, error: lastErr } = await supabase
      .from("subscription_collections")
      .select("id, collected_date, created_at")
      .eq("subscription_id", subscription_id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (lastErr) return res.status(400).json({ error: lastErr.message });

    const row = Array.isArray(last) && last.length ? last[0] : null;
    if (!row) return res.status(400).json({ error: "No collections found to undo" });

    // Delete it
    const { error: delErr } = await supabase
      .from("subscription_collections")
      .delete()
      .eq("id", row.id);

    if (delErr) return res.status(400).json({ error: delErr.message });

    // Revert next_collection_date to the undone collected_date (makes it due again)
    const { error: updErr } = await supabase
      .from("subscriptions")
      .update({ next_collection_date: row.collected_date, updated_at: new Date().toISOString() })
      .eq("id", subscription_id);

    if (updErr) return res.status(400).json({ error: updErr.message });

    return res.status(200).json({ ok: true, reverted_to: row.collected_date });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
