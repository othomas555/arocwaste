import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const adminKey = process.env.OPS_ADMIN_KEY;
  if (!adminKey) {
    return res.status(500).json({ error: "Missing OPS_ADMIN_KEY env var" });
  }

  const provided = req.headers["x-ops-admin-key"];
  if (provided && provided !== adminKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = req.body || {};
    const subscriptionId = body.subscriptionId;

    if (!subscriptionId || typeof subscriptionId !== "string") {
      return res.status(400).json({ error: "Missing subscriptionId" });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc("undo_last_subscription_collection", {
      p_subscription_id: subscriptionId,
    });

    if (error) throw new Error(error.message);

    const row = Array.isArray(data) ? data[0] : null;

    // ✅ Cancel any pending queued email(s) for this subscription
    // (We don’t know the exact collected_date that was undone, so cancel all pending ones for this sub.)
    try {
      await supabase
        .from("notification_queue")
        .update({ status: "cancelled", last_error: "Cancelled by undo" })
        .eq("event_type", "subscription_collected")
        .eq("target_type", "subscription")
        .eq("target_id", subscriptionId)
        .eq("status", "pending");
    } catch {
      // best-effort
    }

    return res.status(200).json({
      ok: true,
      subscriptionId,
      next_collection_date: row?.next_collection_date || null,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Bad request" });
  }
}
