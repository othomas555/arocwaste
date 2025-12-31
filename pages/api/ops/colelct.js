import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function isValidISODate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addDaysISO(isoDate, days) {
  // isoDate YYYY-MM-DD → new YYYY-MM-DD
  const [y, m, d] = isoDate.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function daysForFrequency(freq) {
  const f = String(freq || "").toLowerCase().trim();
  if (f.includes("fortnight")) return 14;
  if (f.includes("three")) return 21;
  if (f.includes("3")) return 21;
  // default weekly
  return 7;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { subscription_id, collected_date } = req.body || {};

    if (!subscription_id) return res.status(400).json({ error: "Missing subscription_id" });
    if (!isValidISODate(collected_date))
      return res.status(400).json({ error: "Missing/invalid collected_date (YYYY-MM-DD)" });

    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("id,frequency,status")
      .eq("id", subscription_id)
      .single();

    if (subErr) return res.status(400).json({ error: subErr.message });

    // Record collection
    const { error: insErr } = await supabase.from("subscription_collections").insert([
      {
        subscription_id,
        collected_date, // keep simple, date string
      },
    ]);

    if (insErr) return res.status(400).json({ error: insErr.message });

    // Advance next_collection_date
    const next = addDaysISO(collected_date, daysForFrequency(sub?.frequency));

    const { error: updErr } = await supabase
      .from("subscriptions")
      .update({ next_collection_date: next, updated_at: new Date().toISOString() })
      .eq("id", subscription_id);

    if (updErr) return res.status(400).json({ error: updErr.message });

    return res.status(200).json({ ok: true, next_collection_date: next });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
