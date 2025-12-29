import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function parseISODateOrNull(s) {
  if (!s) return null;
  if (typeof s !== "string") return null;
  // Expect YYYY-MM-DD
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return s; // keep as YYYY-MM-DD string for Postgres date param
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

    const collectedDate = parseISODateOrNull(body.collectedDate); // optional

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc("mark_subscription_collected", {
      p_subscription_id: subscriptionId,
      p_collected_date: collectedDate, // null => default current_date in function
    });

    if (error) throw new Error(error.message);

    // data will be an array of rows because it's a RETURNS TABLE function
    const row = Array.isArray(data) ? data[0] : null;

    return res.status(200).json({
      ok: true,
      subscriptionId,
      next_collection_date: row?.next_collection_date || null,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Bad request" });
  }
}
