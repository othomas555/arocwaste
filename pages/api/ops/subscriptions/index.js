// pages/api/ops/subscriptions/index.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(500).json({
      error:
        "Supabase admin client not configured. Check env vars for service role key in Vercel (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL used by lib/supabaseAdmin).",
    });
  }

  try {
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim().toLowerCase();
    const limit = clampInt(req.query.limit ?? 200, 1, 500);

    let query = supabase
      .from("subscriptions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);

    if (q) {
      const like = `%${q.replace(/%/g, "")}%`;
      query = query.or(
        [
          `email.ilike.${like}`,
          `name.ilike.${like}`,
          `phone.ilike.${like}`,
          `postcode.ilike.${like}`,
          `address.ilike.${like}`,
          `route_area.ilike.${like}`,
        ].join(",")
      );
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, data: data || [] });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load subscriptions" });
  }
}
