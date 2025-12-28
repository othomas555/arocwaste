import Stripe from "stripe";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

const secretKey = process.env.STRIPE_SECRET_KEY;

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function pickPrices(frequency) {
  // frequency: "weekly" | "fortnightly" | "threeweekly"
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!secretKey || !secretKey.startsWith("sk_")) {
    return res.status(500).json({ error: "Missing or invalid STRIPE_SECRET_KEY" });
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

  try {
    const body = req.body || {};

    const email = String(body.email || "").trim();
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const postcode = String(body.postcode || "").trim();
    const address = String(body.address || "").trim();

    const frequency = String(body.frequency || "weekly"); // weekly|fortnightly|threeweekly
    const extraBags = clampInt(body.extraBags ?? 0, 0, 10);
    const useOwnBin = Boolean(body.useOwnBin);

    const routeDay = String(body.routeDay || "");
    const routeArea = String(body.routeArea || "");

    if (!email || !postcode || !address || !frequency) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const prices = pickPrices(frequency);
    if (!prices?.bin || !prices?.bag) {
      return res.status(500).json({
        error:
          "Stripe Price IDs missing. Check STRIPE_PRICE_BIN_* and STRIPE_PRICE_BAG_* env vars.",
      });
    }

    const depositPriceId = process.env.STRIPE_PRICE_BIN_DEPOSIT;
    if (!depositPriceId) {
      return res.status(500).json({
        error: "Missing STRIPE_PRICE_BIN_DEPOSIT env var",
      });
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    // Build subscription line items
    const line_items = [
      { price: prices.bin, quantity: 1 }, // bin service
    ];

    if (extraBags > 0) {
      line_items.push({ price: prices.bag, quantity: extraBags }); // recurring add-on
    }

    // One-time deposit (if NOT using own bin)
    // Checkout subscription mode supports adding one-time invoice items via subscription_data.add_invoice_items
    const subscription_data = {};
    if (!useOwnBin) {
      subscription_data.add_invoice_items = [{ price: depositPriceId, quantity: 1 }];
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items,
      subscription_data,

      metadata: {
        mode: "bins_subscription",
        frequency,
        extraBags: String(extraBags),
        useOwnBin: useOwnBin ? "yes" : "no",
        routeDay,
        routeArea,
        name,
        phone,
        postcode,
        address,
      },

      success_url: `${origin}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/bins-bags`,
    });

    // Save a pending row (best-effort) so you can track signups even before webhook
    try {
      const supabaseAdmin = getSupabaseAdmin();
      if (supabaseAdmin) {
        await supabaseAdmin.from("subscriptions").upsert(
          {
            stripe_checkout_session_id: session.id,
            status: "pending",
            email,
            name,
            phone,
            postcode,
            address,
            route_day: routeDay,
            route_area: routeArea,
            frequency,
            extra_bags: extraBags,
            use_own_bin: useOwnBin,
            payload: {
              frequency,
              extraBags,
              useOwnBin,
              routeDay,
              routeArea,
            },
          },
          { onConflict: "stripe_checkout_session_id" }
        );
      }
    } catch (e) {
      console.error("Supabase pending subscription save failed:", e?.message || e);
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    const msg = err?.raw?.message || err?.message || "Subscription checkout failed";
    console.error("create-subscription-session error:", msg);
    return res.status(500).json({ error: msg });
  }
}
