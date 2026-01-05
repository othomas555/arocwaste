// pages/api/ops/bulk-assign-routes.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const DAY_INDEX = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

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

function matchesPrefix(postcode, prefix) {
  const p = String(prefix || "").toUpperCase().replace(/\s+/g, " ").trim();
  const pNo = p.replace(/\s+/g, "");
  return (
    (postcode.spaced && postcode.spaced.startsWith(p)) ||
    (postcode.nospace && postcode.nospace.startsWith(pNo))
  );
}

function prefixLen(prefix) {
  return String(prefix || "").replace(/\s+/g, "").length;
}

function slotScore(slot) {
  if (slot === "AM") return 1;
  if (slot === "PM") return 2;
  return 3; // ANY last
}

function londonTodayParts() {
  const dateParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
  }).format(new Date());

  const get = (type) => dateParts.find((p) => p.type === type)?.value;
  const y = get("year");
  const m = get("month");
  const d = get("day");

  return { ymd: `${y}-${m}-${d}`, weekday };
}

function addDaysYMD(ymd, n) {
  const [Y, M, D] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(Y, M - 1, D));
  dt.setUTCDate(dt.getUTCDate() + n);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nextCollectionDateForDay(routeDay) {
  const { ymd: todayYMD, weekday } = londonTodayParts();
  const todayIdx = DAY_INDEX[weekday];
  const targetIdx = DAY_INDEX[routeDay];
  if (!todayIdx || !targetIdx) return null;
  const delta = (targetIdx - todayIdx + 7) % 7; // includes today if same day
  return addDaysYMD(todayYMD, delta);
}

function pickDefaultMatch(matches) {
  // matches: [{name, route_day, slot, matched_prefix, matched_prefix_len}, ...]
  const scored = matches
    .map((m) => ({
      ...m,
      next_date: nextCollectionDateForDay(m.route_day),
    }))
    .sort((a, b) => {
      // longest prefix first
      if ((b.matched_prefix_len || 0) !== (a.matched_prefix_len || 0)) {
        return (b.matched_prefix_len || 0) - (a.matched_prefix_len || 0);
      }
      // earliest next date
      if (a.next_date && b.next_date && a.next_date !== b.next_date) {
        return a.next_date.localeCompare(b.next_date);
      }
      if (a.next_date && !b.next_date) return -1;
      if (!a.next_date && b.next_date) return 1;
      // prefer AM/PM over ANY
      return slotScore(a.slot) - slotScore(b.slot);
    });

  return scored[0] || null;
}

function bad(res, msg, status = 400, extra = {}) {
  return res.status(status).json({ error: msg, ...extra });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return bad(res, "Method not allowed", 405);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad(res, "Supabase admin not configured", 500);

  const body = req.body || {};
  const dryRun = body.dryRun !== undefined ? !!body.dryRun : true;
  const force = !!body.force;
  const recomputeNext = !!body.recomputeNext;
  const limit = Math.max(1, Math.min(500, Number(body.limit || 200)));

  // Which statuses should we touch?
  // Default: active + pending (safe) — cancelled/paused are left alone unless force.
  const statuses = Array.isArray(body.statuses) && body.statuses.length
    ? body.statuses.map((s) => String(s).toLowerCase())
    : ["active", "pending"];

  // Load active route areas once
  const { data: areas, error: areasErr } = await supabase
    .from("route_areas")
    .select("id,name,route_day,slot,postcode_prefixes,active")
    .eq("active", true);

  if (areasErr) return bad(res, areasErr.message, 500);

  // Fetch candidate subscriptions
  // If not force: only those missing route_day or route_area or route_slot
  let query = supabase
    .from("subscriptions")
    .select(
      "id,email,postcode,address,status,route_day,route_area,route_slot,next_collection_date,anchor_date"
    )
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!force) {
    // Supabase doesn't support OR well in query builder in all clients;
    // we fetch a chunk and filter in JS safely.
  }

  const { data: subs, error: subsErr } = await query;
  if (subsErr) return bad(res, subsErr.message, 500);

  const candidates = (subs || []).filter((s) => {
    if (force) return true;
    return !s.route_day || !s.route_area || !s.route_slot;
  });

  const results = [];
  let updated = 0;
  let skipped = 0;
  let noMatch = 0;

  for (const s of candidates) {
    const pc = cleanPostcode(s.postcode);
    if (!pc.nospace) {
      skipped += 1;
      results.push({
        id: s.id,
        status: "skipped",
        reason: "missing_postcode",
      });
      continue;
    }

    // build matches
    const matches = [];
    for (const a of areas || []) {
      const prefixes = Array.isArray(a.postcode_prefixes) ? a.postcode_prefixes : [];
      for (const pref of prefixes) {
        if (matchesPrefix(pc, pref)) {
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

    if (!matches.length) {
      noMatch += 1;
      results.push({
        id: s.id,
        status: "no_match",
        postcode: pc.spaced || pc.raw,
      });
      continue;
    }

    // de-dupe exact duplicates
    const seen = new Set();
    const unique = [];
    for (const m of matches) {
      const key = `${m.route_area_id}|${m.route_day}|${m.slot}|${String(m.matched_prefix).toUpperCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(m);
    }

    const def = pickDefaultMatch(unique);
    if (!def) {
      noMatch += 1;
      results.push({ id: s.id, status: "no_match", postcode: pc.spaced || pc.raw });
      continue;
    }

    const nextDate = nextCollectionDateForDay(def.route_day);

    // If not recomputing next, only set if missing
    const shouldSetNext =
      recomputeNext || force || !s.next_collection_date;

    const patch = {
      route_area: def.route_area,
      route_day: def.route_day,
      route_slot: def.slot || "ANY",
      // keep a small breadcrumb in payload? no new tables, no schema changes required
    };

    if (shouldSetNext && nextDate) {
      patch.next_collection_date = nextDate;
      if (force || !s.anchor_date) patch.anchor_date = nextDate;
    }

    if (dryRun) {
      results.push({
        id: s.id,
        status: "would_update",
        postcode: pc.spaced || pc.raw,
        from: {
          route_area: s.route_area || null,
          route_day: s.route_day || null,
          route_slot: s.route_slot || null,
          next_collection_date: s.next_collection_date || null,
        },
        to: {
          route_area: patch.route_area,
          route_day: patch.route_day,
          route_slot: patch.route_slot,
          next_collection_date: patch.next_collection_date || s.next_collection_date || null,
        },
        matched_prefix: def.matched_prefix,
      });
      continue;
    }

    const { error: updErr } = await supabase
      .from("subscriptions")
      .update(patch)
      .eq("id", s.id);

    if (updErr) {
      results.push({
        id: s.id,
        status: "error",
        error: updErr.message,
      });
      continue;
    }

    updated += 1;
    results.push({
      id: s.id,
      status: "updated",
      postcode: pc.spaced || pc.raw,
      route_area: patch.route_area,
      route_day: patch.route_day,
      route_slot: patch.route_slot,
      next_collection_date: patch.next_collection_date || s.next_collection_date || null,
      matched_prefix: def.matched_prefix,
    });
  }

  return res.status(200).json({
    ok: true,
    dryRun,
    force,
    recomputeNext,
    limit,
    scanned: candidates.length,
    updated,
    skipped,
    noMatch,
    results,
  });
}
