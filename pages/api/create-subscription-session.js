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
  // Get today's date + weekday in Europe/London (avoids UTC drift on Vercel)
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
    weekday, // e.g. "Monday"
  };
}

function addDaysYMD(ymd, n) {
  // ymd is YYYY-MM-DD in London context; safe to treat as date-only.
  // We'll convert using UTC to avoid timezone issues, since we're only moving by whole days.
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

  const delta = (targetIdx - todayIdx + 7) % 7; // includes today (0) if same day
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

  // de-dupe
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

  // default selection:
  // 1) longest prefix
  // 2) earliest next_date
  // 3) slot preference (AM, PM, ANY)
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
        error:
          "Supabase admin is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).",
      });
    }

    // ✅ Route assignment from postcode (authoritative)
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
    const nextCollectionDate = routeLookup.default.next_date || nextCollectionDateForDay(routeDay);

    if (!nextCollectionDate) {
      return res.status(500).json({
        error: "Could not calculate next collection date for assigned route.",
        debug: { routeDay, routeArea, routeSlot },
      });
    }

    // ✅ Build Checkout line items
    // Stripe supports mixing recurring + one-time items in subscription mode.
    const line_items = [{ price: prices.bin, quantity: 1 }];
    if (extraBags > 0) line_items.push({ price: prices.bag, quantity: extraBags });

    // ✅ Deposit as one-time line item (only if NOT using own bin)
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
        nextCollectionDate,
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

          next_collection_date: nextCollectionDate,
          anchor_date: nextCollectionDate,

          payload: {
            frequency,
            extraBags,
            useOwnBin,
            depositApplied,
            routeDay,
            routeArea,
            routeSlot,
            matchedPrefix,
            nextCollectionDate,
          },
        },
        { onConflict: "stripe_checkout_session_id" }
      );
    } catch (e) {
      console.error("Supabase pending subscription save failed:", e?.message || e);
    }

    return res.status(200).json({
      url: session.url,
      route: { routeArea, routeDay, routeSlot, nextCollectionDate, matchedPrefix },
    });
  } catch (err) {
    const msg = err?.raw?.message || err?.message || "Subscription checkout failed";
    console.error("create-subscription-session error:", msg);
    return res.status(500).json({ error: msg });
  }
}
