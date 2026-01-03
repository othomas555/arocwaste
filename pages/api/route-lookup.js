// pages/api/route-lookup.js
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

function cleanPostcode(pc) {
  // Normalize UK postcode to something comparable, but keep a spaced version too
  const raw = String(pc || "").trim().toUpperCase();
  const nospace = raw.replace(/\s+/g, "");
  if (!nospace) return { raw: "", nospace: "", spaced: "" };

  // Try to re-space roughly: last 3 chars are inward code (common UK format)
  let spaced = raw;
  if (!raw.includes(" ") && nospace.length > 3) {
    spaced = `${nospace.slice(0, -3)} ${nospace.slice(-3)}`;
  }
  // Also normalize multiple spaces
  spaced = spaced.replace(/\s+/g, " ").trim();

  return { raw, nospace, spaced };
}

function matchesPrefix(postcode, prefix) {
  // prefix stored like "CF36" or "CF33 4"
  // compare both space and no-space forms, startsWith
  const p = String(prefix || "").toUpperCase().replace(/\s+/g, " ").trim();
  const pNo = p.replace(/\s+/g, "");

  return (
    (postcode.spaced && postcode.spaced.startsWith(p)) ||
    (postcode.nospace && postcode.nospace.startsWith(pNo))
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const postcode = cleanPostcode(req.query.postcode);
  if (!postcode.nospace) return res.status(400).json({ error: "Missing postcode" });

  const supabase = getSupabaseAdmin();

  const { data: areas, error } = await supabase
    .from("route_areas")
    .select("id,name,route_day,slot,postcode_prefixes,active")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  // Find best match: longest prefix wins (so "CF33 4" beats "CF33")
  let best = null;
  let bestLen = -1;

  for (const a of areas || []) {
    const prefixes = Array.isArray(a.postcode_prefixes) ? a.postcode_prefixes : [];
    for (const pref of prefixes) {
      if (matchesPrefix(postcode, pref)) {
        const len = String(pref || "").replace(/\s+/g, "").length;
        if (len > bestLen) {
          bestLen = len;
          best = {
            route_area_id: a.id,
            route_area: a.name,
            route_day: a.route_day,
            slot: a.slot,
            matched_prefix: pref,
          };
        }
      }
    }
  }

  if (!best) {
    return res.status(200).json({
      in_area: false,
      postcode: postcode.spaced || postcode.raw,
    });
  }

  return res.status(200).json({
    in_area: true,
    postcode: postcode.spaced || postcode.raw,
    ...best,
  });
}
