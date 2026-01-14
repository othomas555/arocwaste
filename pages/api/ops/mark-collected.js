import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function parseISODateOrNull(s) {
  if (!s) return null;
  if (typeof s !== "string") return null;
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return s; // YYYY-MM-DD
}

function addHoursIso(hours) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

function safeText(x) {
  return String(x ?? "").trim();
}

function buildAddress(row) {
  // Try a few common patterns without breaking if columns don’t exist
  const direct = safeText(row?.address);
  if (direct) return direct;

  const parts = [
    safeText(row?.address_1),
    safeText(row?.address_2),
    safeText(row?.town),
  ].filter(Boolean);

  return parts.join(", ");
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

    // ✅ Queue notification (+1 hour) (best-effort)
    try {
      const { data: subRow } = await supabase
        .from("subscriptions")
        .select("id,email,name,postcode,address,address_1,address_2,town")
        .eq("id", subscriptionId)
        .maybeSingle();

      const recipient = safeText(subRow?.email);
      if (recipient) {
        const payload = {
          name: safeText(subRow?.name),
          postcode: safeText(subRow?.postcode),
          address: buildAddress(subRow),
          collected_date: collectedDate || "",

          // links
          book_again_url: "https://www.arocwaste.co.uk/bins-bags",
          review_url: "https://www.arocwaste.co.uk/review",
          social_url: "https://www.arocwaste.co.uk/",
          reply_to: "hello@arocwaste.co.uk",

          // optional label
          service_label: "your wheelie bin collection",
        };

        await supabase.from("notification_queue").insert({
          event_type: "subscription_collected",
          target_type: "subscription",
          target_id: subscriptionId,
          recipient_email: recipient,
          payload,
          scheduled_at: addHoursIso(1),
          status: "pending",
        });
      }
    } catch {
      // best-effort: don’t block marking collected
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
