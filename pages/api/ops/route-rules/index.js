import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function normPrefix(input) {
  // Store with spaces normalised for readability; DB also keeps prefix_nospace generated for matching
  return (input || "").toString().trim().toUpperCase().replace(/\s+/g, " ");
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("postcode_route_rules")
      .select("id,postcode_prefix,prefix_nospace,route_day,route_area,active,notes,created_at,updated_at")
      .order("active", { ascending: false })
      .order("postcode_prefix", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ rules: data || [] });
  }

  if (req.method === "POST") {
    try {
      const body = req.body || {};
      const postcode_prefix = normPrefix(body.postcode_prefix);
      const route_day = (body.route_day || "").toString().trim();
      const route_area = (body.route_area || "").toString().trim();
      const active = typeof body.active === "boolean" ? body.active : true;
      const notes = (body.notes || "").toString();

      if (!postcode_prefix) return res.status(400).json({ error: "postcode_prefix is required" });
      if (!route_day) return res.status(400).json({ error: "route_day is required" });
      if (!route_area) return res.status(400).json({ error: "route_area is required" });

      const { data, error } = await supabase
        .from("postcode_route_rules")
        .insert([{ postcode_prefix, route_day, route_area, active, notes }])
        .select("id");

      if (error) {
        // Unique violation etc.
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json({ ok: true, id: data?.[0]?.id || null });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Server error" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
