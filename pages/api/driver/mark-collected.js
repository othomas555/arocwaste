// pages/api/driver/mark-collected.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
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

async function loadSubscriptionForEmail(supabase, subscription_id) {
  // Try the most likely table first. If your project uses a different name,
  // this fallback avoids you having to remember which one is live.
  const tryTables = ["subscriptions", "subscribers"];

  for (const t of tryTables) {
    const { data, error } = await supabase
      .from(t)
      .select("*")
      .eq("id", subscription_id)
      .maybeSingle();

    if (error) {
      // ignore and try next
      continue;
    }
    if (data) return data;
  }

  return null;
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
    // IMPORTANT FIX: column is run_id (NOT daily_run_id)
    const { data: link, error: eLink } = await supabase
      .from("daily_run_staff")
      .select("run_id")
      .eq("run_id", run_id)
      .eq("staff_id", staffRow.id)
      .maybeSingle();

    if (eLink) return res.status(500).json({ error: eLink.message });
    if (!link) return res.status(403).json({ error: "Not assigned to this run" });

    // insert collection row
    const { error: eIns } = await supabase
      .from("subscription_collections")
      .insert({ subscription_id, collected_date });

    if (eIns) return res.status(500).json({ error: eIns.message });

    // Queue a delayed "bin emptied" email (1 hour) if we have a valid subscriber email
    const subRow = await loadSubscriptionForEmail(supabase, subscription_id);
    const recipient = String(subRow?.email || "").trim();

    if (isEmail(recipient)) {
      const scheduled_at = plusHoursISO(1);
      const target_id = `${subscription_id}:${collected_date}`;

      const payload = {
        subscription_id,
        collected_date,
        postcode: subRow?.postcode || "",
        address: subRow?.address || "",
        name: subRow?.name || subRow?.customer_name || "",
        service_label: "your wheelie bin collection",
        book_again_url: "https://www.arocwaste.co.uk/bins-bags",
        review_url: process.env.GOOGLE_REVIEW_URL || "https://www.arocwaste.co.uk/",
        social_url: process.env.SOCIAL_URL || "https://www.arocwaste.co.uk/",
        reply_to: recipient,
        run_id,
        completed_by_staff_email: email,
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

      // If there is no unique index for this event, duplicate rows could happen.
      // That's acceptable for now; we only error if it's a real insert problem.
      if (eQ) {
        return res.status(500).json({ error: eQ.message });
      }

      return res.status(200).json({ ok: true, notification: "queued", scheduled_at });
    }

    return res.status(200).json({ ok: true, notification: "skipped_no_valid_email" });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to mark collected" });
  }
}
