// pages/api/ops/catalogue/list.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  try {
    const category = String(req.query.category || "").trim().toLowerCase();

    let q = supabase
      .from("catalog_items")
      .select("category,slug,title,subtitle,price_pounds,popular,active,sort_order,updated_at")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });

    if (category && category !== "all") {
      q = q.eq("category", category);
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, items: data || [] });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load catalogue" });
  }
}
