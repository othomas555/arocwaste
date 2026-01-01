import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function postcodeNoSpaceUpper(s) {
  return (s || "").toString().trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * POST { postcode: "NP20 4HF" }
 * -> { match: { route_day, route_area, postcode_prefix, id } | null }
 *
 * Matching:
 * - normalise postcode: uppercase, remove spaces
 * - find active rules whose prefix_nospace matches the start of postcode
 * - choose longest prefix_nospace
 */
export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const postcodeRaw = (body.postcode || "").toString();
    const postcodeKey = postcodeNoSpaceUpper(postcodeRaw);

    if (!postcodeKey) return res.status(400).json({ error: "postcode is required" });

    // Pull active rules only (small table, fine to fetch and match in JS)
    const { data, error } = await supabase
      .from("postcode_route_rules")
      .select("id,postcode_prefix,prefix_nospace,route_day,route_area,active")
      .eq("active", true);

    if (error) return res.status(500).json({ error: error.message });

    const rules = Array.isArray(data) ? data : [];

    let best = null;
    for (const r of rules) {
      const prefix = (r.prefix_nospace || "").toString();
      if (!prefix) continue;
      if (postcodeKey.startsWith(prefix)) {
        if (!best || prefix.length > (best.prefix_nospace || "").length) best = r;
      }
    }

    if (!best) return res.status(200).json({ match: null });

    return res.status(200).json({
      match: {
        id: best.id,
        postcode_prefix: best.postcode_prefix,
        route_day: best.route_day,
        route_area: best.route_area,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
