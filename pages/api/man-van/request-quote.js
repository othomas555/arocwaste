import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

/* ---- Route lookup helpers copied from create-checkout-session (kept consistent) ---- */
function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

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

const DAY_INDEX = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

function slotScore(slot) {
  if (slot === "AM") return 1;
  if (slot === "PM") return 2;
  return 3; // ANY
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
  const dt = new Date(Date.UTC(Y, M - 1, D, 12, 0, 0));
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

async function lookupRouteByPostcode(supabaseAdmin, postcodeStr) {
  const postcode = cleanPostcode(postcodeStr);
  if (!postcode.nospace) return { in_area: false, matches: [], default: null, postcode: "" };

  const { data: areas, error } = await supabaseAdmin
    .from("route_areas")
    .select("id,name,route_day,slot,postcode_prefixes,active")
    .eq("active", true);

  if (error) throw new Error(error.message);

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

  const seen = new Set();
  const unique = [];
  for (const m of matches) {
    const key = `${m.route_area_id}|${m.route_day}|${m.slot}|${String(m.matched_prefix).toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(m);
  }

  if (!unique.length) {
    return {
      in_area: false,
      matches: [],
      default: null,
      postcode: postcode.spaced || postcode.raw,
    };
  }

  const scored = unique
    .map((m) => ({ ...m, next_date: nextCollectionDateForDay(m.route_day) }))
    .sort((a, b) => {
      if ((b.matched_prefix_len || 0) !== (a.matched_prefix_len || 0)) {
        return (b.matched_prefix_len || 0) - (a.matched_prefix_len || 0);
      }
      if (a.next_date && b.next_date && a.next_date !== b.next_date) {
        return a.next_date.localeCompare(b.next_date);
      }
      if (a.next_date && !b.next_date) return -1;
      if (!a.next_date && b.next_date) return 1;
      return slotScore(a.slot) - slotScore(b.slot);
    });

  const top = scored[0];

  return {
    in_area: true,
    postcode: postcode.spaced || postcode.raw,
    matches: unique.map((m) => ({
      route_area_id: m.route_area_id,
      route_area: m.route_area,
      route_day: m.route_day,
      slot: m.slot,
      matched_prefix: m.matched_prefix,
    })),
    default: {
      route_area_id: top.route_area_id,
      route_area: top.route_area,
      route_day: top.route_day,
      slot: top.slot,
      matched_prefix: top.matched_prefix,
      next_date: top.next_date || null,
    },
  };
}
/* ---------------------------------------------------------------------- */

function cleanText(s) {
  return String(s || "").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  try {
    const body = req.body || {};

    const postcodeRaw = cleanText(body.postcode);
    const name = cleanText(body.name);
    const phone = cleanText(body.phone);
    const email = cleanText(body.email);
    const house = cleanText(body.house);
    const addressLine1 = cleanText(body.address_line1);
    const town = cleanText(body.town);
    const notes = cleanText(body.notes);

    if (!postcodeRaw || !name || !phone || !house || !addressLine1 || !town) {
      return res.status(400).json({
        error: "Missing required fields (postcode, name, phone, house, address line, town).",
      });
    }

    // Route assignment (server-side, authoritative)
    const routeLookup = await lookupRouteByPostcode(supabase, postcodeRaw);
    if (!routeLookup.in_area || !routeLookup.default) {
      return res.status(400).json({
        error: "Sorry — we don’t currently cover that postcode for Man & Van quote visits.",
        postcode: routeLookup.postcode || postcodeRaw,
      });
    }

    const routeArea = routeLookup.default.route_area;
    const routeDay = routeLookup.default.route_day;
    const routeSlot = String(routeLookup.default.slot || "ANY").toUpperCase() || "ANY";
    const matchedPrefix = routeLookup.default.matched_prefix || "";

    const appointmentDate = routeLookup.default.next_date || nextCollectionDateForDay(routeDay);
    if (!appointmentDate || !isValidYMD(appointmentDate)) {
      return res.status(500).json({ error: "Could not calculate appointment date for this area/day." });
    }

    // Build a human-friendly address string for Ops/Drivers
    const postcodeClean = routeLookup.postcode || postcodeRaw;
    const address = `${house} ${addressLine1}, ${town}`.replace(/\s+/g, " ").trim();

    // Insert into bookings as a “quote visit job”
    const payload = {
      mode: "manvan_quote",
      quote_type: "visit",
      driver_summary: "Man & Van — Quote visit",
      postcode: postcodeClean,
      address,
      house,
      address_line1: addressLine1,
      town,
      notes,
      route: { routeDay, routeArea, routeSlot, matchedPrefix },
      source: "man-van-page",
      created_at_local: londonTodayParts().ymd,
    };

    const { data: inserted, error: eIns } = await supabase
      .from("bookings")
      .insert({
        // Mark as quote job (not paid)
        payment_status: "quote",
        status: "quote_requested",

        // We treat visit appointment as the “service date” for scheduling in Ops
        service_date: appointmentDate,
        collection_date: appointmentDate, // keep legacy sync

        postcode: postcodeClean,
        address,
        route_day: routeDay,
        route_area: routeArea,
        route_slot: routeSlot,

        title: "Man & Van — Quote visit",
        name,
        email: email || null,
        phone,
        notes: notes || null,

        // No total yet (quote required)
        total_pence: null,
        payload,
      })
      .select("id")
      .maybeSingle();

    if (eIns) return res.status(500).json({ error: eIns.message });

    return res.status(200).json({
      ok: true,
      job_id: inserted?.id ? String(inserted.id) : "",
      postcode: postcodeClean,
      route_area: routeArea,
      route_day: routeDay,
      route_slot: routeSlot,
      appointment_date: appointmentDate,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to create Man & Van quote request" });
  }
}
