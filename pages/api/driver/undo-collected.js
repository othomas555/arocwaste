import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

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
    const run_id = String(body.run_id || "").trim();
    const subscription_id = String(body.subscription_id || "").trim();
    const collected_date = String(body.collected_date || "").trim(); // YYYY-MM-DD

    if (!run_id || !subscription_id || !collected_date) {
      return res.status(400).json({ error: "Missing run_id, subscription_id, collected_date" });
    }

    // validate session + staff
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid session" });

    const email = String(userData.user.email || "").trim().toLowerCase();
    const { data: staffRow } = await supabase
      .from("staff")
      .select("id,active")
      .ilike("email", email)
      .maybeSingle();

    if (!staffRow) return res.status(403).json({ error: "No staff record for this email" });
    if (staffRow.active === false) return res.status(403).json({ error: "Staff is inactive" });

    // must be assigned to run
    const { data: link, error: eLink } = await supabase
      .from("daily_run_staff")
      .select("run_id")
      .eq("run_id", run_id)
      .eq("staff_id", staffRow.id)
      .maybeSingle();

    if (eLink) return res.status(500).json({ error: eLink.message });
    if (!link) return res.status(403).json({ error: "Not assigned to this run" });

    // undo = delete the collection row
    const { error: eDel } = await supabase
      .from("subscription_collections")
      .delete()
      .eq("subscription_id", subscription_id)
      .eq("collected_date", collected_date);

    if (eDel) return res.status(500).json({ error: eDel.message });

    // ✅ cancel queued email(s) for this collection (best-effort)
    // Try to cancel specifically for the same collected_date, else cancel any pending for this subscription.
    try {
      const q1 = await supabase
        .from("notification_queue")
        .update({ status: "cancelled", last_error: "Cancelled by undo" })
        .eq("event_type", "subscription_collected")
        .eq("target_type", "subscription")
        .eq("target_id", subscription_id)
        .eq("status", "pending")
        .eq("payload->>collected_date", collected_date);

      if (q1?.error) {
        // fallback: cancel all pending for this subscription
        await supabase
          .from("notification_queue")
          .update({ status: "cancelled", last_error: "Cancelled by undo" })
          .eq("event_type", "subscription_collected")
          .eq("target_type", "subscription")
          .eq("target_id", subscription_id)
          .eq("status", "pending");
      }
    } catch {
      // best-effort
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to undo collected" });
  }
}
