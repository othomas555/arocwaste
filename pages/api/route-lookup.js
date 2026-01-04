// pages/api/route-lookup.js
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

function cleanPostcode(pc) {
  const raw = String(pc || "").trim().toUpperCase();
  const nospace = raw.replace(/\s+/g, "");
  if (!nospace) return { raw: "", nospace: "", spaced: "" };

  let spaced = raw;
  if (!raw.includes(" ") && nospace.length > 3) {
    spaced = `${nospace.slice(0, -3)} ${nospace.slice(-3)}`;
  }
  spaced = spaced.replace(/\s+/g, " ").trim();

  return { raw, nospace, spaced };
}

function normalizePrefix(prefix) {
  const p = String(prefix || "").toUpperCase().replace(/\s+/g, " ").trim();
  const pNo = p.replace(/\s+/g, "");
  return { p, pNo };
}

function matchesPrefix(postcode, prefix) {
  const { p, pNo } = normalizePrefix(prefix);
  return (
    (postcode.spaced && postcode.spaced.startsWith(p)) ||
    (postcode.nospace && postcode.nospace.startsWith(pNo))
  );
}

function prefixLen(prefix) {
  return String(prefix || "").replace(/\s+/g, "").length;
}

const DAY_INDEX = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

function nextDateForDay(dayName) {
  // Returns YYYY-MM-DD for the next occurrence of dayName (including today if same day)
  const target = DAY_INDEX[dayName];
  if (!target) return null;

  const now = new Date();
  const todayIdx = ((now.getDay() + 6) % 7) + 1; // convert JS (Sun=0) -> Mon=1..Sun=7
  const delta = (target - todayIdx + 7) % 7;

  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + delta);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function pickDefault(matches) {
  // Choose "best" default:
  // 1) longest matched prefix
  // 2) earliest next date
  // 3) slot preference: AM, PM, ANY (so we pick a concrete slot first)
  if (!matches.length) return null;

  const slotScore = (slot) => {
    if (slot === "AM") return 1;
    if (slot === "PM") return 2;
    return 3; // ANY last
  };

  const scored = matches
    .map((m) => {
      const next_date = nextDateForDay(m.route_day);
      return { ...m, next_date };
    })
    .sort((a, b) => {
      const pa = a.matched_prefix_len || 0;
      const pb = b.matched_prefix_len || 0;
      if (pb !== pa) return pb - pa; // longer prefix first

      // earliest next_date
      if (a.next_date && b.next_date && a.next_date !== b.next_date) {
        return a.next_date.localeCompare(b.next_date);
      }
      if (a.next_date && !b.next_date) return -1;
      if (!a.next_date && b.next_date) return 1;

      // slot preference
      return slotScore(a.slot) - slotScore(b.slot);
    });

  const top = scored[0];
  return {
    route_area_id: top.route_area_id,
    route_area: top.route_area,
    route_day: top.route_day,
    slot: top.slot,
    matched_prefix: top.matched_prefix,
    next_date: top.next_date || null,
  };
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
    .eq("active", true);

  if (error) return res.status(500).json({ error: error.message });

  // Collect ALL matching entries
  const matches = [];
  for (const a of areas || []) {
    const prefixes = Array.isArray(a.postcode_prefixes) ? a.postcode_prefixes : [];
    for (const pref of prefixes) {
      if (matchesPrefix(postcode, pref)) {
        matches.push({
          route_area_id: a.id,
          route_area: a.name,
          route_day: a.route_day,
          slot: a.slot || "ANY",
          matched_prefix: pref,
          matched_prefix_len: prefixLen(pref),
        });
      }
    }
  }

  // De-dupe exact duplicates (can happen if someone enters the same prefix twice)
  const seen = new Set();
  const uniqueMatches = [];
  for (const m of matches) {
    const key = `${m.route_area_id}|${m.route_day}|${m.slot}|${String(m.matched_prefix).toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueMatches.push(m);
  }

  // Sort for readability: day order then slot then area name
  uniqueMatches.sort((a, b) => {
    const da = DAY_INDEX[a.route_day] || 99;
    const db = DAY_INDEX[b.route_day] || 99;
    if (da !== db) return da - db;

    const sa = a.slot === "AM" ? 1 : a.slot === "PM" ? 2 : 3;
    const sb = b.slot === "AM" ? 1 : b.slot === "PM" ? 2 : 3;
    if (sa !== sb) return sa - sb;

    return String(a.route_area || "").localeCompare(String(b.route_area || ""));
  });

  if (!uniqueMatches.length) {
    return res.status(200).json({
      in_area: false,
      postcode: postcode.spaced || postcode.raw,
      matches: [],
      default: null,
    });
  }

  const def = pickDefault(uniqueMatches);

  return res.status(200).json({
    in_area: true,
    postcode: postcode.spaced || postcode.raw,
    matches: uniqueMatches.map((m) => ({
      route_area_id: m.route_area_id,
      route_area: m.route_area,
      route_day: m.route_day,
      slot: m.slot,
      matched_prefix: m.matched_prefix,
    })),
    default: def,
  });
}
