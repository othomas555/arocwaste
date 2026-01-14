import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function s(x) {
  return String(x ?? "").trim();
}

function addHoursIso(hours) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

function pickFirst(row, keys) {
  for (const k of keys) {
    const v = s(row?.[k]);
    if (v) return v;
  }
  return "";
}

function buildAddress(row) {
  const direct = pickFirst(row, ["address", "full_address"]);
  if (direct) return direct;

  const parts = [
    pickFirst(row, ["address_1", "address1", "address_line_1", "line1"]),
    pickFirst(row, ["address_2", "address2", "address_line_2", "line2"]),
    pickFirst(row, ["town", "city"]),
  ].filter(Boolean);

  return parts.join(", ");
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

    // ✅ queue email (+1 hour) with DEBUG
    let notif = { attempted: true, queued: false, reason: "", queue_id: null };

    try {
      // Pull the subscription row (select * so we don’t fail if column names differ)
      const { data: subRow, error: subErr } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("id", subscription_id)
        .maybeSingle();

      if (subErr) {
        notif.reason = `Failed to load subscription: ${subErr.message}`;
      } else if (!subRow) {
        notif.reason = "No subscription row found";
      } else {
        const recipient = pickFirst(subRow, [
          "email",
          "customer_email",
          "billing_email",
          "stripe_email",
          "contact_email",
        ]);

        if (!recipient) {
          notif.reason =
            "No recipient email found on subscriptions row (checked: email/customer_email/billing_email/stripe_email/contact_email)";
        } else {
          const payload = {
            name: pickFirst(subRow, ["name", "full_name", "customer_name", "contact_name"]),
            postcode: pickFirst(subRow, ["postcode", "post_code", "postal_code"]),
            address: buildAddress(subRow),
            collected_date,

            book_again_url: "https://www.arocwaste.co.uk/bins-bags",
            review_url: "https://www.arocwaste.co.uk/review",
            social_url: "https://www.arocwaste.co.uk/",
            reply_to: "hello@arocwaste.co.uk",

            service_label: "your wheelie bin collection",
          };

          const { data: qRow, error: qErr } = await supabase
            .from("notification_queue")
            .insert({
              event_type: "subscription_collected",
              target_type: "subscription",
              target_id: subscription_id,
              recipient_email: recipient,
              payload,
              scheduled_at: addHoursIso(1),
              status: "pending",
            })
            .select("id")
            .maybeSingle();

          if (qErr) {
            notif.reason = `Queue insert failed: ${qErr.message}`;
          } else {
            notif.queued = true;
            notif.queue_id = qRow?.id || null;
          }
        }
      }
    } catch (e) {
      notif.reason = `Queue exception: ${String(e?.message || e)}`;
    }

    return res.status(200).json({ ok: true, notification: notif });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to mark collected" });
  }
}
