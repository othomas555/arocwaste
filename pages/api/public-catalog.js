import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const category = String(req.query.category || "").trim().toLowerCase();
  if (!category) return res.status(400).json({ error: "Missing category" });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  try {
    const { data, error } = await supabase
      .from("catalog_items")
      .select("category,slug,title,subtitle,price_pounds,popular,active,sort_order")
      .eq("category", category)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    const items = (data || []).map((x) => ({
      slug: x.slug,
      title: x.title,
      subtitle: x.subtitle || "",
      price: Number(x.price_pounds || 0),
      popular: !!x.popular,
    }));

    return res.status(200).json({ ok: true, category, items });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load catalog" });
  }
}
