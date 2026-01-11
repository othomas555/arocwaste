import Stripe from "stripe";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

const secretKey = process.env.STRIPE_SECRET_KEY;

function clampQty(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.max(1, Math.min(50, Math.trunc(x)));
}

function buildItemsSummary(items) {
  const clean = Array.isArray(items) ? items.filter((x) => x && x.title) : [];
  if (!clean.length) return "";
  const first = String(clean[0].title || "Item");
  if (clean.length === 1) return first;
  return `${first} + ${clean.length - 1} more`;
}

function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function normalizeYMD(input) {
  const s = String(input || "").trim();
  return isValidYMD(s) ? s : "";
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
  const delta = (targetIdx - todayIdx + 7) % 7;
  return addDaysYMD(todayYMD, delta);
}

function getSmallOrderConfig() {
  const threshold = Number(process.env.SMALL_ORDER_THRESHOLD_POUNDS ?? 25);
  const fee = Number(process.env.SMALL_ORDER_FEE_POUNDS ?? 20);

  const thresholdPence = Math.round((Number.isFinite(threshold) ? threshold : 25) * 100);
  const feePence = Math.round((Number.isFinite(fee) ? fee : 20) * 100);

  return {
    thresholdPence: Math.max(0, thresholdPence),
    feePence: Math.max(0, feePence),
  };
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

// ------- Driver summary helpers (new) -------
function toQtyTitle(qty, title) {
  const t = String(title || "").trim();
  if (!t) return "";
  const n = Number(qty);
  const q = Number.isFinite(n) && n > 1 ? Math.trunc(n) : 1;
  return q > 1 ? `${q} × ${t}` : t;
}

function buildDriverSummaryFromBasket(cleanItems) {
  const parts = [];
  for (const it of cleanItems || []) {
    const title = String(it?.title || "").trim();
    if (!title) continue;
    parts.push(toQtyTitle(it?.qty ?? 1, title));
  }
  if (!parts.length) return "One-off collection";
  return parts.join(", ");
}

function buildDriverSummaryFromSingle(title, qty) {
  const s = toQtyTitle(qty ?? 1, title);
  return s || "One-off collection";
}
// ------------------------------------------

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!secretKey || !secretKey.startsWith("sk_")) {
    return res.status(500).json({
      error:
        "Missing or invalid STRIPE_SECRET_KEY in Vercel Environment Variables (must start with sk_).",
    });
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

  try {
    const body = req.body || {};
    const mode = String(body.mode || "single"); // "single" or "basket"

    const email = String(body.email || "").trim();
    const postcodeRaw = String(body.postcode || "").trim();
    const address = String(body.address || "").trim();
    const serviceDate = normalizeYMD(body.date);

    const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const totalPounds = Number(body.total);
    if (!Number.isFinite(totalPounds) || totalPounds <= 0) {
      return res.status(400).json({ error: "Invalid total amount" });
    }
    const totalPence = Math.round(totalPounds * 100);

    if (!email || !postcodeRaw || !address || !serviceDate) {
      return res.status(400).json({ error: "Missing required booking fields" });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({
        error:
          "Supabase admin is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).",
      });
    }

    // ✅ Authoritative route assignment from postcode (server-side)
    const routeLookup = await lookupRouteByPostcode(supabaseAdmin, postcodeRaw);
    if (!routeLookup.in_area || !routeLookup.default) {
      return res.status(400).json({
        error: "Sorry — we don’t currently cover that postcode.",
        postcode: routeLookup.postcode || postcodeRaw,
      });
    }

    const routeArea = routeLookup.default.route_area;
    const routeDay = routeLookup.default.route_day;
    const routeSlot = (routeLookup.default.slot || "ANY").toString().toUpperCase() || "ANY";
    const matchedPrefix = routeLookup.default.matched_prefix || "";

    // ---- BASKET MODE ----
    if (mode === "basket") {
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return res.status(400).json({ error: "Basket is empty" });

      const cleanItems = items
        .filter((x) => x && x.title)
        .map((x) => ({
          id: String(x.id || ""),
          category: String(x.category || ""),
          slug: String(x.slug || ""),
          title: String(x.title || ""),
          unitPrice: Number(x.unitPrice || 0),
          qty: clampQty(x.qty),
        }))
        .filter((x) => x.qty >= 1);

      if (!cleanItems.length) return res.status(400).json({ error: "Basket is empty" });

      const timeAdd = Number(body.timeAdd ?? 0);
      const removeAdd = Number(body.removeAdd ?? 0);

      const lineItems = [];

      // Items subtotal (pence) for small-order rule
      const itemsSubtotalPence = cleanItems.reduce((sum, it) => {
        const unitPence = Math.round((Number(it.unitPrice) || 0) * 100);
        if (unitPence <= 0) return sum;
        return sum + unitPence * (Number(it.qty) || 0);
      }, 0);

      for (const it of cleanItems) {
        const unitPence = Math.round((Number(it.unitPrice) || 0) * 100);
        if (unitPence <= 0) continue;

        lineItems.push({
          quantity: it.qty,
          price_data: {
            currency: "gbp",
            unit_amount: unitPence,
            product_data: {
              name: `AROC Waste – ${it.title}`,
              description: it.category ? `Category: ${it.category}` : undefined,
            },
          },
        });
      }

      if (Number.isFinite(timeAdd) && timeAdd > 0) {
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: Math.round(timeAdd * 100),
            product_data: { name: "Time option" },
          },
        });
      }

      if (Number.isFinite(removeAdd) && removeAdd > 0) {
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: Math.round(removeAdd * 100),
            product_data: { name: "Remove from property" },
          },
        });
      }

      // Small order service charge (server-enforced)
      const { thresholdPence, feePence } = getSmallOrderConfig();
      let serviceChargePence = 0;
      if (
        feePence > 0 &&
        thresholdPence > 0 &&
        itemsSubtotalPence > 0 &&
        itemsSubtotalPence < thresholdPence
      ) {
        serviceChargePence = feePence;
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: serviceChargePence,
            product_data: {
              name: "Small order service charge",
              description: `Applied when items subtotal is under £${(thresholdPence / 100).toFixed(0)}`,
            },
          },
        });
      }

      // Ensure Stripe total matches UI total (small adjustment only)
      const computedPence = lineItems.reduce((sum, li) => {
        const qty = Number(li.quantity) || 0;
        const amt = Number(li.price_data?.unit_amount) || 0;
        return sum + qty * amt;
      }, 0);

      const diff = totalPence - computedPence;
      if (diff !== 0) {
        if (Math.abs(diff) > 500) {
          return res.status(400).json({
            error: "Price mismatch between basket items and total. Please refresh and try again.",
          });
        }

        lineItems.push({
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: diff,
            product_data: {
              name: "Order adjustment",
              description: "Auto-adjust to match checkout total",
            },
          },
        });
      }

      const itemsSummary = buildItemsSummary(cleanItems);
      const driverSummary = buildDriverSummaryFromBasket(cleanItems);

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: email,
        line_items: lineItems,

        metadata: {
          mode: "basket",
          item_count: String(cleanItems.length),
          items_summary: itemsSummary,
          driver_summary: driverSummary,
          date: serviceDate,
          routeDay,
          routeArea,
          routeSlot,
          matchedPrefix,
          name: String(body.name ?? ""),
          phone: String(body.phone ?? ""),
          postcode: routeLookup.postcode || postcodeRaw,
          address,
          notes: String(body.notes ?? ""),
          total: String(body.total ?? ""),
          small_order_threshold_pence: String(thresholdPence),
          small_order_fee_pence: String(serviceChargePence),
        },

        success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/cancel`,
      });

      // ✅ Save booking in DB with schedulable fields promoted to columns
      try {
        const payload = {
          mode: "basket",
          items: cleanItems,

          // ✅ driver-friendly text stored in payload (no schema change)
          driver_summary: driverSummary,

          time: String(body.time ?? ""),
          timeAdd: Number(body.timeAdd ?? 0),
          remove: String(body.remove ?? ""),
          removeAdd: Number(body.removeAdd ?? 0),
          smallOrder: {
            thresholdPence,
            feePence: serviceChargePence,
            itemsSubtotalPence,
          },
          date: serviceDate,
          name: String(body.name ?? ""),
          phone: String(body.phone ?? ""),
          postcode: routeLookup.postcode || postcodeRaw,
          address,
          notes: String(body.notes ?? ""),
          total: Number(body.total ?? 0),
          route: { routeDay, routeArea, routeSlot, matchedPrefix },
        };

        const { error: upsertErr } = await supabaseAdmin
          .from("bookings")
          .upsert(
            {
              stripe_session_id: session.id,
              payment_status: "pending",
              status: "booked",

              // ✅ ops-first column + legacy column kept in sync
              service_date: serviceDate,
              collection_date: serviceDate,

              postcode: routeLookup.postcode || postcodeRaw,
              address,
              route_day: routeDay,
              route_area: routeArea,
              route_slot: routeSlot || "ANY",

              title: "Basket order",
              name: String(body.name ?? ""),
              email,
              phone: String(body.phone ?? ""),
              notes: String(body.notes ?? ""),
              total_pence: totalPence,
              payload,
            },
            { onConflict: "stripe_session_id" }
          );

        if (upsertErr) console.error("Supabase upsert error:", upsertErr.message);
      } catch (e) {
        console.error("Supabase save failed:", e?.message || e);
      }

      return res.status(200).json({ url: session.url });
    }

    // ---- SINGLE MODE ----
    const title = String(body.title || "").trim();
    const qtyRaw = Number(body.qty ?? 1);
    const qty = Number.isInteger(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;

    if (!title) {
      return res.status(400).json({ error: "Missing title" });
    }

    const driverSummary = buildDriverSummaryFromSingle(title, qty);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,

      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: totalPence,
            product_data: {
              name: `AROC Waste – ${title} (x${qty})`,
              description: `Collection on ${serviceDate}`,
            },
          },
        },
      ],

      metadata: {
        mode: "single",
        title,
        qty: String(qty),
        driver_summary: driverSummary,
        date: serviceDate,
        routeDay,
        routeArea,
        routeSlot,
        matchedPrefix,
        name: String(body.name ?? ""),
        phone: String(body.phone ?? ""),
        postcode: routeLookup.postcode || postcodeRaw,
        address,
        notes: String(body.notes ?? ""),
        total: String(body.total ?? ""),
      },

      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel`,
    });

    // ✅ Save booking in DB with schedulable fields promoted to columns
    try {
      const payload = {
        mode: "single",
        title,
        qty,

        // ✅ driver-friendly text stored in payload (no schema change)
        driver_summary: driverSummary,

        base: Number(body.base ?? 0),
        time: String(body.time ?? ""),
        timeAdd: Number(body.timeAdd ?? 0),
        remove: String(body.remove ?? ""),
        removeAdd: Number(body.removeAdd ?? 0),
        date: serviceDate,
        name: String(body.name ?? ""),
        phone: String(body.phone ?? ""),
        postcode: routeLookup.postcode || postcodeRaw,
        address,
        notes: String(body.notes ?? ""),
        total: Number(body.total ?? 0),
        route: { routeDay, routeArea, routeSlot, matchedPrefix },
      };

      const { error: upsertErr } = await supabaseAdmin
        .from("bookings")
        .upsert(
          {
            stripe_session_id: session.id,
            payment_status: "pending",
            status: "booked",

            // ✅ ops-first column + legacy column kept in sync
            service_date: serviceDate,
            collection_date: serviceDate,

            postcode: routeLookup.postcode || postcodeRaw,
            address,
            route_day: routeDay,
            route_area: routeArea,
            route_slot: routeSlot || "ANY",

            title,
            name: String(body.name ?? ""),
            email,
            phone: String(body.phone ?? ""),
            notes: String(body.notes ?? ""),
            total_pence: totalPence,
            payload,
          },
          { onConflict: "stripe_session_id" }
        );

      if (upsertErr) console.error("Supabase upsert error:", upsertErr.message);
    } catch (e) {
      console.error("Supabase save failed:", e?.message || e);
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    const msg = err?.raw?.message || err?.message || "Stripe session creation failed (unknown error)";
    console.error("Stripe error:", msg);
    return res.status(500).json({ error: msg });
  }
}
