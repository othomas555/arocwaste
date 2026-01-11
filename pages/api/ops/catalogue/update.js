// pages/api/ops/catalogue/update.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function toBool(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

function toNumber(v, def = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  try {
    const body = req.body || {};

    const category = String(body.category || "").trim().toLowerCase();
    const slug = String(body.slug || "").trim();

    const title = String(body.title || "").trim();
    const subtitle = String(body.subtitle || "").trim();

    const price_pounds = toNumber(body.price_pounds, 0);
    const popular = toBool(body.popular);
    const active = toBool(body.active);
    const sort_order = toNumber(body.sort_order, 0);

    if (!category || !slug) return res.status(400).json({ error: "Missing category or slug" });
    if (!title) return res.status(400).json({ error: "Missing title" });

    const { error } = await supabase
      .from("catalog_items")
      .update({
        title,
        subtitle,
        price_pounds,
        popular,
        active,
        sort_order,
        updated_at: new Date().toISOString(),
      })
      .eq("category", category)
      .eq("slug", slug);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to update item" });
  }
}
