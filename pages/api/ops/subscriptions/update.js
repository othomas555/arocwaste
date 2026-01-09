// pages/api/ops/subscriptions/update.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const FREQUENCY_TO_DAYS = {
  weekly: 7,
  fortnightly: 14,
  "three-weekly": 21,
};

const ROUTE_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ROUTE_SLOTS = ["", "ANY", "AM", "PM"];

function londonTodayYMD() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Use “noon UTC” to avoid DST edge weirdness.
function ymdToDateNoonUTC(ymd) {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}
function dateToYMDUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDaysYMD(ymd, days) {
  const dt = ymdToDateNoonUTC(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dateToYMDUTC(dt);
}
function weekdayOfYMD(ymd) {
  const d = ymdToDateNoonUTC(ymd).getUTCDay();
  const map = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return map[d];
}

function computeNextFromAnchor({ anchorYMD, frequencyDays, todayYMD }) {
  let next = anchorYMD;
  for (let i = 0; i < 2000; i++) {
    if (next >= todayYMD) return next;
    next = addDaysYMD(next, frequencyDays);
  }
  return null;
}

function validateFrequency(freq) {
  return typeof freq === "string" && Object.prototype.hasOwnProperty.call(FREQUENCY_TO_DAYS, freq);
}
function normalizeSlot(slot) {
  if (slot == null) return "";
  const s = String(slot).trim().toUpperCase();
  if (s === "ANY" || s === "AM" || s === "PM") return s;
  return "";
}
function validateRouteDay(d) {
  return d == null || d === "" || ROUTE_DAYS.includes(d);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = req.body || {};

    const subscriptionId = body.subscription_id;
    if (!subscriptionId) return res.status(400).json({ error: "Missing subscription_id" });

    // Allowed updates from ops UI
    const route_day = body.route_day ?? null;
    const route_area = body.route_area ?? null;
    const route_slot = normalizeSlot(body.route_slot);
    const frequency = body.frequency ?? null;

    // Explicit scheduling controls (only applied if provided)
    const scheduling_mode = body.scheduling_mode || "AUTO_FROM_ANCHOR"; // AUTO_FROM_ANCHOR | MANUAL_NEXT
    const manual_next_collection_date = body.manual_next_collection_date || null; // required if MANUAL_NEXT
    const set_anchor_to_next = !!body.set_anchor_to_next;

    // Validate basics
    if (!validateRouteDay(route_day)) {
      return res.status(400).json({ error: "Invalid route_day" });
    }
    if (route_slot && !ROUTE_SLOTS.includes(route_slot)) {
      return res.status(400).json({ error: "Invalid route_slot" });
    }
    if (frequency != null && !validateFrequency(frequency)) {
      return res.status(400).json({ error: "Invalid frequency" });
    }

    // Load existing record
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "id, route_day, route_area, route_slot, frequency, next_collection_date, anchor_date, status, name, email, postcode, address"
      )
      .eq("id", subscriptionId)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    const todayYMD = londonTodayYMD();

    const newFrequency = frequency ?? existing.frequency;
    if (!validateFrequency(newFrequency)) {
      return res.status(400).json({ error: "Subscription has invalid frequency; cannot update safely" });
    }
    const freqDays = FREQUENCY_TO_DAYS[newFrequency];

    const newRouteDay = route_day ?? existing.route_day;
    const newRouteArea = route_area ?? existing.route_area;
    const newRouteSlot = route_slot ?? normalizeSlot(existing.route_slot);

    const warnings = [];

    // Determine anchor to use (default existing)
    let anchorYMD = existing.anchor_date && isValidYMD(existing.anchor_date) ? existing.anchor_date : null;
    let nextYMD = null;

    // Decide next_collection_date
    if (scheduling_mode === "MANUAL_NEXT") {
      if (!isValidYMD(manual_next_collection_date)) {
        return res.status(400).json({ error: "MANUAL_NEXT requires manual_next_collection_date (YYYY-MM-DD)" });
      }
      nextYMD = manual_next_collection_date;

      if (set_anchor_to_next) {
        anchorYMD = nextYMD;
      } else if (!anchorYMD) {
        warnings.push("anchor_date was missing; leaving it null (schedule may be less predictable).");
      }
    } else {
      // AUTO_FROM_ANCHOR
      if (!anchorYMD) {
        const fallback =
          (existing.next_collection_date && isValidYMD(existing.next_collection_date) && existing.next_collection_date) ||
          todayYMD;
        anchorYMD = fallback;
        warnings.push("anchor_date was missing; using fallback anchor (next_collection_date or today).");
      }

      nextYMD = computeNextFromAnchor({ anchorYMD, frequencyDays: freqDays, todayYMD });
      if (!nextYMD) {
        return res.status(500).json({ error: "Failed to compute next_collection_date" });
      }
    }

    // Day alignment warnings (no auto-shifting)
    if (newRouteDay && isValidYMD(nextYMD)) {
      const nextWd = weekdayOfYMD(nextYMD);
      if (nextWd !== newRouteDay) {
        warnings.push(
          `next_collection_date (${nextYMD}, ${nextWd}) does not match route_day (${newRouteDay}). This is allowed but may confuse ops/driver views.`
        );
      }
    }
    if (anchorYMD && newRouteDay) {
      const anchorWd = weekdayOfYMD(anchorYMD);
      if (anchorWd !== newRouteDay) {
        warnings.push(
          `anchor_date (${anchorYMD}, ${anchorWd}) does not match route_day (${newRouteDay}). Future AUTO_FROM_ANCHOR schedules may look odd.`
        );
      }
    }

    const updatePatch = {
      route_day: newRouteDay || null,
      route_area: newRouteArea || null,
      route_slot: newRouteSlot || null,
      frequency: newFrequency,
      next_collection_date: nextYMD,
    };

    const existingAnchorValid = existing.anchor_date && isValidYMD(existing.anchor_date);
    const wroteFallbackAnchor = scheduling_mode === "AUTO_FROM_ANCHOR" && !existingAnchorValid && anchorYMD;

    if (scheduling_mode === "MANUAL_NEXT" && set_anchor_to_next) {
      updatePatch.anchor_date = anchorYMD;
    } else if (wroteFallbackAnchor) {
      updatePatch.anchor_date = anchorYMD;
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("subscriptions")
      .update(updatePatch)
      .eq("id", subscriptionId)
      .select(
        "id, route_day, route_area, route_slot, frequency, next_collection_date, anchor_date, status, name, email, postcode, address"
      )
      .single();

    if (updErr) {
      return res.status(500).json({ error: updErr.message });
    }

    return res.status(200).json({
      ok: true,
      warnings,
      before: {
        route_day: existing.route_day,
        route_area: existing.route_area,
        route_slot: existing.route_slot,
        frequency: existing.frequency,
        next_collection_date: existing.next_collection_date,
        anchor_date: existing.anchor_date,
      },
      after: {
        route_day: updated.route_day,
        route_area: updated.route_area,
        route_slot: updated.route_slot,
        frequency: updated.frequency,
        next_collection_date: updated.next_collection_date,
        anchor_date: updated.anchor_date,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unknown server error" });
  }
}
