import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function postcodeNoSpaceUpper(s) {
  return (s || "").toString().trim().toUpperCase().replace(/\s+/g, "");
}

function pickBestMatch(rules, postcodeKey) {
  let best = null;
  for (const r of rules) {
    const prefix = (r.prefix_nospace || "").toString();
    if (!prefix) continue;
    if (postcodeKey.startsWith(prefix)) {
      if (!best || prefix.length > (best.prefix_nospace || "").length) best = r;
    }
  }
  return best;
}

/**
 * POST { subscription_id: "...uuid...", force?: boolean }
 *
 * Behaviour:
 * - If subscription is overridden and force is not true => no changes
 * - Otherwise set route_day + route_area from rule (if any)
 * - Returns match or null
 */
export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const subscription_id = (body.subscription_id || "").toString().trim();
    const force = !!body.force;

    if (!subscription_id) return res.status(400).json({ error: "subscription_id is required" });

    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("id,postcode,route_override")
      .eq("id", subscription_id)
      .single();

    if (subErr) return res.status(400).json({ error: subErr.message });

    if (sub.route_override && !force) {
      return res
        .status(200)
        .json({ ok: true, skipped: true, reason: "route_override=true", match: null });
    }

    const postcodeKey = postcodeNoSpaceUpper(sub.postcode);
    if (!postcodeKey) return res.status(200).json({ ok: true, match: null });

    const { data: rulesData, error: rulesErr } = await supabase
      .from("postcode_route_rules")
      .select("id,postcode_prefix,prefix_nospace,route_day,route_area")
      .eq("active", true);

    if (rulesErr) return res.status(500).json({ error: rulesErr.message });

    const rules = Array.isArray(rulesData) ? rulesData : [];
    const match = pickBestMatch(rules, postcodeKey);

    if (!match) return res.status(200).json({ ok: true, match: null });

    const { error: upErr } = await supabase
      .from("subscriptions")
      .update({ route_day: match.route_day, route_area: match.route_area })
      .eq("id", subscription_id);

    if (upErr) return res.status(500).json({ error: upErr.message });

    return res.status(200).json({
      ok: true,
      match: {
        id: match.id,
        postcode_prefix: match.postcode_prefix,
        route_day: match.route_day,
        route_area: match.route_area,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
