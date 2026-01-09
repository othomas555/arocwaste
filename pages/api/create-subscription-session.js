import Stripe from "stripe";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

const secretKey = process.env.STRIPE_SECRET_KEY;

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function isStripePriceId(v) {
  return typeof v === "string" && v.trim().startsWith("price_");
}

function pickPrices(frequency) {
  const map = {
    weekly: {
      bin: process.env.STRIPE_PRICE_BIN_WEEKLY,
      bag: process.env.STRIPE_PRICE_BAG_WEEKLY,
    },
    fortnightly: {
      bin: process.env.STRIPE_PRICE_BIN_FORTNIGHTLY,
      bag: process.env.STRIPE_PRICE_BAG_FORTNIGHTLY,
    },
    threeweekly: {
      bin: process.env.STRIPE_PRICE_BIN_THREEWEEKLY,
      bag: process.env.STRIPE_PRICE_BAG_THREEWEEKLY,
    },
  };
  return map[frequency] || null;
}

function validateEnvForPrices() {
  const missing = [];
  const invalid = [];

  const required = [
    "STRIPE_PRICE_BIN_WEEKLY",
    "STRIPE_PRICE_BIN_FORTNIGHTLY",
    "STRIPE_PRICE_BIN_THREEWEEKLY",
    "STRIPE_PRICE_BAG_WEEKLY",
    "STRIPE_PRICE_BAG_FORTNIGHTLY",
    "STRIPE_PRICE_BAG_THREEWEEKLY",
    "STRIPE_PRICE_BIN_DEPOSIT",
  ];

  for (const key of required) {
    const val = process.env[key];
    if (!val) missing.push(key);
    else if (!isStripePriceId(val)) invalid.push(`${key}=${String(val).trim()}`);
  }

  return { missing, invalid };
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
  // Prefer concrete slots over ANY
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

  return {
    ymd: `${y}-${m}-${d}`,
    weekday,
  };
}

function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Use noon UTC to avoid DST oddities for date-only math.
function ymdToDateNoonUTC(ymd) {
  const [Y, M, D] = ymd.split("-").map((x) => Number(x));
  return new Date(Date.UTC(Y, M - 1, D, 12, 0, 0));
}
function dateToYMDUTC(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysYMD(ymd, n) {
  const dt = ymdToDateNoonUTC(ymd);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dateToYMDUTC(dt);
}

function weekdayNameOfYMD(ymd) {
  const dt = ymdToDateNoonUTC(ymd);
  const idx = dt.getUTCDay(); // 0=Sun..6=Sat
  const map = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return map[idx];
}

function nextCollectionDateForDay(routeDay) {
  const { ymd: todayYMD, weekday } = londonTodayParts();
  const todayIdx = DAY_INDEX[weekday];
  const targetIdx = DAY_INDEX[routeDay];
  if (!todayIdx || !targetIdx) return null;

  const delta = (targetIdx - todayIdx + 7) % 7; // includes today (0) if same day
  return addDaysYMD(todayYMD, delta);
}

function nextOccurrencesOfDay(routeDay, count = 6) {
  const first = nextCollectionDateForDay(routeDay);
  if (!first) return [];
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(addDaysYMD(first, i * 7));
  }
  return out;
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
    .map((m) => ({
      ...m,
      next_date: nextCollectionDateForDay(m.route_day),
    }))
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!secretKey || !secretKey.startsWith("sk_")) {
    return res.status(500).json({ error: "Missing or invalid STRIPE_SECRET_KEY" });
  }

  const envCheck = validateEnvForPrices();
  if (envCheck.missing.length || envCheck.invalid.length) {
    return res.status(500).json({
      error: "Stripe price configuration error",
      missing: envCheck.missing,
      invalid: envCheck.invalid,
      hint:
        "Check Vercel env vars for this environment (Production vs Preview). Values must start with price_. Redeploy after changes.",
    });
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

  try {
    const body = req.body || {};

    const email = String(body.email || "").trim();
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const postcodeRaw = String(body.postcode || "").trim();
    const address = String(body.address || "").trim();

    const frequencyRaw = String(body.frequency || "weekly").trim().toLowerCase();
    const allowed = new Set(["weekly", "fortnightly", "threeweekly"]);
    const frequency = allowed.has(frequencyRaw) ? frequencyRaw : "weekly";

    const extraBags = clampInt(body.extraBags ?? 0, 0, 10);
    const useOwnBin = Boolean(body.useOwnBin);

    // Optional chosen start date (YYYY-MM-DD) from UI
    const startDate = body.startDate ? String(body.startDate).trim() : null;

    if (!email || !postcodeRaw || !address) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const prices = pickPrices(frequency);
    if (!prices?.bin || !prices?.bag) {
      return res.status(500).json({
        error: `Stripe Price IDs not mapped for frequency="${frequency}"`,
        debug: { frequency, bin: prices?.bin || null, bag: prices?.bag || null },
      });
    }

    const depositPriceId = process.env.STRIPE_PRICE_BIN_DEPOSIT;
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({
        error: "Supabase admin is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).",
      });
    }

    // Route assignment from postcode
    const routeLookup = await lookupRouteByPostcode(supabaseAdmin, postcodeRaw);

    if (!routeLookup.in_area || !routeLookup.default) {
      return res.status(400).json({
        error: "Sorry — we don’t currently cover that postcode.",
        postcode: routeLookup.postcode || postcodeRaw,
      });
    }

    const routeArea = routeLookup.default.route_area;
    const routeDay = routeLookup.default.route_day;
    const routeSlot = routeLookup.default.slot || "ANY";
    const matchedPrefix = routeLookup.default.matched_prefix || "";

    const nextAvailable = routeLookup.default.next_date || nextCollectionDateForDay(routeDay);
    if (!nextAvailable) {
      return res.status(500).json({
        error: "Could not calculate next collection date for assigned route.",
        debug: { routeDay, routeArea, routeSlot },
      });
    }

    const startOptions = nextOccurrencesOfDay(routeDay, 6);

    // Decide chosen start date:
    // - if user provided startDate, validate it
    // - else default to nextAvailable
    let chosenStart = nextAvailable;

    if (startDate) {
      if (!isValidYMD(startDate)) {
        return res.status(400).json({ error: "Invalid startDate format (expected YYYY-MM-DD)." });
      }
      const wd = weekdayNameOfYMD(startDate);
      if (wd !== routeDay) {
        return res.status(400).json({
          error: "startDate does not match the route day.",
          debug: { startDate, startDateWeekday: wd, routeDay },
        });
      }
      if (startDate < nextAvailable) {
        return res.status(400).json({
          error: "startDate must be on/after the next available collection date.",
          debug: { startDate, nextAvailable },
        });
      }
      chosenStart = startDate;
    }

    // Checkout line items
    const line_items = [{ price: prices.bin, quantity: 1 }];
    if (extraBags > 0) line_items.push({ price: prices.bag, quantity: extraBags });

    // Deposit as one-time line item (only if NOT using own bin)
    const depositApplied = !useOwnBin;
    if (depositApplied) {
      line_items.push({ price: depositPriceId, quantity: 1 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items,

      metadata: {
        mode: "bins_subscription",
        frequency,
        extraBags: String(extraBags),
        useOwnBin: useOwnBin ? "yes" : "no",
        depositApplied: depositApplied ? "yes" : "no",

        routeDay,
        routeArea,
        routeSlot,
        matchedPrefix,

        name,
        phone,
        postcode: routeLookup.postcode || postcodeRaw,
        address,

        nextCollectionDate: chosenStart, // what we will schedule as first collection
        chosenStartDate: chosenStart,
      },

      success_url: `${origin}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/bins-bags`,
    });

    // Save pending row (best effort)
    try {
      await supabaseAdmin.from("subscriptions").upsert(
        {
          stripe_checkout_session_id: session.id,
          status: "pending",
          email,
          name,
          phone,
          postcode: routeLookup.postcode || postcodeRaw,
          address,

          route_day: routeDay,
          route_area: routeArea,
          route_slot: routeSlot,

          frequency,
          extra_bags: extraBags,
          use_own_bin: useOwnBin,

          next_collection_date: chosenStart,
          anchor_date: chosenStart,

          payload: {
            frequency,
            extraBags,
            useOwnBin,
            depositApplied,
            routeDay,
            routeArea,
            routeSlot,
            matchedPrefix,
            nextAvailable,
            chosenStartDate: chosenStart,
            startOptions,
          },
        },
        { onConflict: "stripe_checkout_session_id" }
      );
    } catch (e) {
      console.error("Supabase pending subscription save failed:", e?.message || e);
    }

    return res.status(200).json({
      url: session.url,
      route: {
        routeArea,
        routeDay,
        routeSlot,
        matchedPrefix,
        nextAvailable,
        chosenStartDate: chosenStart,
        startOptions,
      },
    });
  } catch (err) {
    const msg = err?.raw?.message || err?.message || "Subscription checkout failed";
    console.error("create-subscription-session error:", msg);
    return res.status(500).json({ error: msg });
  }
}
