import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function addHoursIso(hours) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

function safeText(x) {
  return String(x ?? "").trim();
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

    // insert collection row
    const { error: eIns } = await supabase
      .from("subscription_collections")
      .insert({ subscription_id, collected_date });

    if (eIns) return res.status(500).json({ error: eIns.message });

    // Lookup subscriber info for email payload
    const { data: subRow, error: eSub } = await supabase
      .from("subscriptions")
      .select("id,email,name,postcode,address_1,address_2,town")
      .eq("id", subscription_id)
      .maybeSingle();

    if (!eSub && subRow && safeText(subRow.email)) {
      const name = safeText(subRow.name);
      const postcode = safeText(subRow.postcode);
      const addrParts = [
        safeText(subRow.address_1),
        safeText(subRow.address_2),
        safeText(subRow.town),
      ].filter(Boolean);
      const address = addrParts.join(", ");

      // Insert notification for +1 hour (undo window)
      const payload = {
        name: name || "",
        postcode,
        address,
        collected_date,
        book_again_url: "https://www.arocwaste.co.uk/bins-bags",
        review_url: "https://www.arocwaste.co.uk/review",
        social_url: "https://www.arocwaste.co.uk/",
        reply_to: "hello@arocwaste.co.uk",
      };

      await supabase.from("notification_queue").insert({
        event_type: "subscription_collected",
        target_type: "subscription",
        target_id: subscription_id,
        recipient_email: safeText(subRow.email),
        payload,
        scheduled_at: addHoursIso(1),
        status: "pending",
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to mark collected" });
  }
}
