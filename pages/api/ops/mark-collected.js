// pages/api/ops/mark-collected.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function parseISODateOrNull(s) {
  if (!s) return null;
  if (typeof s !== "string") return null;
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return s; // YYYY-MM-DD
}

function isEmail(s) {
  const x = String(s || "").trim();
  if (!x) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}

function plusHoursISO(hours) {
  const d = new Date();
  d.setHours(d.getHours() + Number(hours || 0));
  return d.toISOString();
}

function todayYMD() {
  return new Date().toISOString().slice(0, 10);
}

async function loadSubscriptionForEmail(supabase, subscription_id) {
  const tryTables = ["subscriptions", "subscribers"];

  for (const t of tryTables) {
    const { data, error } = await supabase
      .from(t)
      .select("*")
      .eq("id", subscription_id)
      .maybeSingle();

    if (error) continue;
    if (data) return data;
  }

  return null;
}

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

    const collectedDate = parseISODateOrNull(body.collectedDate);

    const supabase = getSupabaseAdmin();

    // IMPORTANT:
    // If collectedDate is null, OMIT the param so Postgres default kicks in.
    const rpcArgs = { p_subscription_id: subscriptionId };
    if (collectedDate) rpcArgs.p_collected_date = collectedDate;

    const { data, error } = await supabase.rpc("mark_subscription_collected", rpcArgs);

    if (error) throw new Error(error.message);

    const row = Array.isArray(data) ? data[0] : null;

    // Queue delayed email (1 hour) if subscriber has a valid email
    const usedDate = collectedDate || todayYMD();
    const subRow = await loadSubscriptionForEmail(supabase, subscriptionId);
    const recipient = String(subRow?.email || "").trim();

    if (isEmail(recipient)) {
      const scheduled_at = plusHoursISO(1);
      const target_id = `${subscriptionId}:${usedDate}`;

      const payload = {
        subscription_id: subscriptionId,
        collected_date: usedDate,
        postcode: subRow?.postcode || "",
        address: subRow?.address || "",
        name: subRow?.name || subRow?.customer_name || "",
        service_label: "your wheelie bin collection",
        book_again_url: "https://www.arocwaste.co.uk/bins-bags",
        review_url: process.env.GOOGLE_REVIEW_URL || "https://www.arocwaste.co.uk/",
        social_url: process.env.SOCIAL_URL || "https://www.arocwaste.co.uk/",
        reply_to: recipient,
        completed_by_staff_email: "ops",
      };

      const { error: eQ } = await supabase.from("notification_queue").insert({
        event_type: "subscription_collected",
        target_type: "subscription",
        target_id,
        recipient_email: recipient,
        scheduled_at,
        status: "pending",
        payload,
      });

      if (eQ) throw new Error(eQ.message);
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
