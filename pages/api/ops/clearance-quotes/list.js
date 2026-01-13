// pages/api/ops/clearance-quotes/list.js
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

  const status = String(req.query.status || "").trim();
  const q = String(req.query.q || "").trim();
  const limit = clampInt(req.query.limit, 1, 200) || 50;
  const offset = clampInt(req.query.offset, 0, 1000000) || 0;

  let query = supabase
    .from("clearance_quotes")
    .select(
      "id,created_at,status,postcode,in_area,route_area,route_day,slot,next_date,name,email,phone,clearance_type,address,access_notes,preferred_dates,photos_links",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);

  // Simple search (Ops convenience): match postcode or name
  if (q) {
    const qq = q.replace(/[%_]/g, ""); // avoid wildcards
    query = query.or(`postcode.ilike.%${qq}%,name.ilike.%${qq}%`);
  }

  const { data, error, count } = await query;

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    ok: true,
    items: data || [],
    count: count ?? (data ? data.length : 0),
    limit,
    offset,
  });
}
