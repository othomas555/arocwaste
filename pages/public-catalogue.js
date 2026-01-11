import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  try {
    const { data, error } = await supabase
      .from("pricing_settings")
      .select("small_order_threshold_pounds, small_order_fee_pounds")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });

    const threshold = Number(data?.small_order_threshold_pounds ?? 25);
    const fee = Number(data?.small_order_fee_pounds ?? 20);

    return res.status(200).json({
      ok: true,
      small_order_threshold_pounds: Number.isFinite(threshold) ? threshold : 25,
      small_order_fee_pounds: Number.isFinite(fee) ? fee : 20,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load settings" });
  }
}
