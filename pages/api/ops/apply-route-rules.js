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
 * POST
 * {
 *   statuses?: ["active","trialing","pending"]  // default active+trialing
 *   dryRun?: boolean                           // default false
 * }
 *
 * Behaviour:
 * - Applies rule to records that are NOT overridden (route_override=false)
 * - Skips overridden records (route_override=true)
 * - Overwrites route_day/route_area to match rule (because rule is the truth unless overridden)
 */
export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const statuses =
      Array.isArray(body.statuses) && body.statuses.length ? body.statuses : ["active", "trialing"];
    const dryRun = !!body.dryRun;

    // 1) Load active rules
    const { data: rulesData, error: rulesErr } = await supabase
      .from("postcode_route_rules")
      .select("id,postcode_prefix,prefix_nospace,route_day,route_area,active")
      .eq("active", true);

    if (rulesErr) return res.status(500).json({ error: rulesErr.message });

    const rules = Array.isArray(rulesData) ? rulesData : [];

    // 2) Load subs in scope
    const { data: subs, error: subsErr } = await supabase
      .from("subscriptions")
      .select("id,status,postcode,route_day,route_area,route_override,route_override_reason")
      .in("status", statuses);

    if (subsErr) return res.status(500).json({ error: subsErr.message });

    const updates = [];
    const noMatch = [];
    const skipped = [];

    for (const s of subs || []) {
      const postcodeKey = postcodeNoSpaceUpper(s.postcode);
      if (!postcodeKey) {
        skipped.push({ id: s.id, reason: "Missing postcode" });
        continue;
      }

      if (s.route_override) {
        skipped.push({ id: s.id, reason: "Route overridden (route_override=true)" });
        continue;
      }

      const match = pickBestMatch(rules, postcodeKey);
      if (!match) {
        noMatch.push({ id: s.id, postcode: s.postcode });
        continue;
      }

      const currentDay = (s.route_day || "").toString().trim();
      const currentArea = (s.route_area || "").toString().trim();

      const needsUpdate = currentDay !== match.route_day || currentArea !== match.route_area;
      if (!needsUpdate) {
        skipped.push({ id: s.id, reason: "Already matches rule" });
        continue;
      }

      updates.push({
        id: s.id,
        postcode: s.postcode,
        patch: { route_day: match.route_day, route_area: match.route_area },
        match: {
          postcode_prefix: match.postcode_prefix,
          route_day: match.route_day,
          route_area: match.route_area,
        },
      });
    }

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        dryRun: true,
        statuses,
        totalSubs: (subs || []).length,
        toUpdate: updates.length,
        skipped: skipped.length,
        noMatch: noMatch.length,
        sample: updates.slice(0, 25),
      });
    }

    // 3) Apply updates (safe sequential; fine for MVP volumes)
    let applied = 0;
    for (const u of updates) {
      const { error: upErr } = await supabase.from("subscriptions").update(u.patch).eq("id", u.id);
      if (upErr) {
        return res.status(500).json({ error: `Failed updating ${u.id}: ${upErr.message}` });
      }
      applied += 1;
    }

    return res.status(200).json({
      ok: true,
      statuses,
      totalSubs: (subs || []).length,
      applied,
      skipped: skipped.length,
      noMatch: noMatch.length,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
