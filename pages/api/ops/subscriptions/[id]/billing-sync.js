// pages/api/ops/subscriptions/[id]/billing-sync.js
import Stripe from "stripe";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

const secretKey = process.env.STRIPE_SECRET_KEY;

function isStripeSubId(v) {
  return typeof v === "string" && v.startsWith("sub_");
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

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function summarizeStripeItems(items) {
  return (items || []).map((it) => ({
    id: it.id,
    price: it?.price?.id || null,
    quantity: it.quantity ?? null,
  }));
}

function computeExpected(frequency, extraBags) {
  const prices = pickPrices(frequency);
  if (!prices?.bin || !prices?.bag) return null;

  const expected = [
    { kind: "bin", price: prices.bin, quantity: 1 },
  ];

  const bags = clampInt(extraBags ?? 0, 0, 10);
  if (bags > 0) expected.push({ kind: "bags", price: prices.bag, quantity: bags });

  return expected;
}

function compare(expected, stripeItems) {
  const notes = [];
  let ok = true;

  const stripe = summarizeStripeItems(stripeItems);

  // Find bin item by expected bin price (or any bin-like item if mismatch)
  const expBin = expected.find((x) => x.kind === "bin");
  const expBags = expected.find((x) => x.kind === "bags");

  const stripeBinMatch = stripe.find((s) => s.price === expBin.price);
  if (!stripeBinMatch) {
    ok = false;
    notes.push(`Missing bin price ${expBin.price} in Stripe subscription items.`);
  } else if (Number(stripeBinMatch.quantity || 0) !== 1) {
    ok = false;
    notes.push(`Bin quantity in Stripe is ${stripeBinMatch.quantity} (expected 1).`);
  }

  if (expBags) {
    const stripeBagMatch = stripe.find((s) => s.price === expBags.price);
    if (!stripeBagMatch) {
      ok = false;
      notes.push(`Missing bag price ${expBags.price} in Stripe subscription items.`);
    } else if (Number(stripeBagMatch.quantity || 0) !== expBags.quantity) {
      ok = false;
      notes.push(
        `Bag quantity in Stripe is ${stripeBagMatch.quantity} (expected ${expBags.quantity}).`
      );
    }
  } else {
    // expected no bags
    const hasAnyBag = stripe.some((s) => {
      const weekly = pickPrices("weekly");
      const fort = pickPrices("fortnightly");
      const three = pickPrices("threeweekly");
      const bagPrices = new Set([weekly?.bag, fort?.bag, three?.bag].filter(Boolean));
      return s.price && bagPrices.has(s.price);
    });
    if (hasAnyBag) {
      ok = false;
      notes.push("Stripe subscription has recurring bags, but Supabase expects 0 extra bags.");
    }
  }

  // Extra safety: ensure there aren’t additional recurring items besides expected
  const expectedPriceSet = new Set(expected.map((e) => e.price));
  const unexpected = stripe.filter((s) => s.price && !expectedPriceSet.has(s.price));
  if (unexpected.length) {
    ok = false;
    notes.push(
      `Stripe has unexpected recurring item(s): ${unexpected
        .map((u) => `${u.price} (qty ${u.quantity ?? "?"})`)
        .join(", ")}`
    );
  }

  return { ok, notes, stripeSummary: stripe };
}

async function writeStatus(supabase, id, status, notes) {
  await supabase
    .from("subscriptions")
    .update({
      billing_alignment_status: status,
      billing_alignment_checked_at: new Date().toISOString(),
      billing_alignment_notes: notes ? String(notes).slice(0, 2000) : null,
    })
    .eq("id", id);
}

export default async function handler(req, res) {
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!secretKey || !secretKey.startsWith("sk_")) {
    return res.status(500).json({ error: "Missing or invalid STRIPE_SECRET_KEY" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

  const action = String(req.body?.action || "check"); // "check" | "apply"

  try {
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("id,frequency,extra_bags,stripe_subscription_id")
      .eq("id", id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!sub) return res.status(404).json({ error: "Subscription not found" });

    if (!isStripeSubId(sub.stripe_subscription_id)) {
      await writeStatus(supabase, id, "error", "Missing stripe_subscription_id (sub_...).");
      return res.status(400).json({ error: "Missing stripe_subscription_id on this subscriber" });
    }

    const expected = computeExpected(sub.frequency, sub.extra_bags);
    if (!expected) {
      await writeStatus(supabase, id, "error", "Price mapping missing for this frequency.");
      return res.status(500).json({ error: "Stripe price mapping missing for this frequency" });
    }

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id, {
      expand: ["items.data.price"],
    });

    const items = stripeSub?.items?.data || [];

    // If apply: update Stripe to match expected
    if (action === "apply") {
      // Identify existing items
      const current = summarizeStripeItems(items);

      const expBin = expected.find((x) => x.kind === "bin");
      const expBags = expected.find((x) => x.kind === "bags");

      // Find any existing bin item (we’ll update the first item that matches any of the bin prices, else fallback to first item)
      const binPrices = new Set([
        process.env.STRIPE_PRICE_BIN_WEEKLY,
        process.env.STRIPE_PRICE_BIN_FORTNIGHTLY,
        process.env.STRIPE_PRICE_BIN_THREEWEEKLY,
      ].filter(Boolean));

      const existingBin =
        current.find((c) => c.price && binPrices.has(c.price)) || current[0];

      if (!existingBin?.id) {
        await writeStatus(supabase, id, "error", "Could not locate Stripe subscription items.");
        return res.status(500).json({ error: "Could not locate Stripe subscription item to update" });
      }

      // Find any existing bag item (any known bag price)
      const bagPrices = new Set([
        process.env.STRIPE_PRICE_BAG_WEEKLY,
        process.env.STRIPE_PRICE_BAG_FORTNIGHTLY,
        process.env.STRIPE_PRICE_BAG_THREEWEEKLY,
      ].filter(Boolean));

      const existingBag = current.find((c) => c.price && bagPrices.has(c.price));

      const itemsUpdate = [];

      // Update bin to correct price and qty=1
      itemsUpdate.push({
        id: existingBin.id,
        price: expBin.price,
        quantity: 1,
      });

      // Bags logic:
      if (expBags) {
        if (existingBag?.id) {
          itemsUpdate.push({
            id: existingBag.id,
            price: expBags.price,
            quantity: expBags.quantity,
          });
        } else {
          itemsUpdate.push({
            price: expBags.price,
            quantity: expBags.quantity,
          });
        }
      } else {
        // expected no bags -> remove if exists
        if (existingBag?.id) {
          itemsUpdate.push({ id: existingBag.id, deleted: true });
        }
      }

      // Also remove unexpected recurring items (practical safety)
      const expectedPriceSet = new Set(expected.map((e) => e.price));
      const unexpected = current.filter((c) => c.price && !expectedPriceSet.has(c.price));
      for (const u of unexpected) {
        // don’t delete the bin item we’re using as anchor
        if (u.id && u.id !== existingBin.id && u.id !== existingBag?.id) {
          itemsUpdate.push({ id: u.id, deleted: true });
        }
      }

      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        proration_behavior: "create_prorations",
        items: itemsUpdate,
      });

      // Re-fetch for final status
      const stripeSub2 = await stripe.subscriptions.retrieve(sub.stripe_subscription_id, {
        expand: ["items.data.price"],
      });

      const cmp2 = compare(expected, stripeSub2?.items?.data || []);
      const status2 = cmp2.ok ? "ok" : "mismatch";
      await writeStatus(supabase, id, status2, cmp2.notes.join(" "));

      return res.status(200).json({
        ok: true,
        action: "apply",
        expected,
        stripe_items: cmp2.stripeSummary,
        aligned: cmp2.ok,
        notes: cmp2.notes,
      });
    }

    // Default action: check
    const cmp = compare(expected, items);
    const status = cmp.ok ? "ok" : "mismatch";
    await writeStatus(supabase, id, status, cmp.notes.join(" "));

    return res.status(200).json({
      ok: true,
      action: "check",
      expected,
      stripe_items: cmp.stripeSummary,
      aligned: cmp.ok,
      notes: cmp.notes,
    });
  } catch (e) {
    await writeStatus(supabase, id, "error", e?.message || "Stripe check failed");
    return res.status(500).json({ error: e?.message || "Stripe check failed" });
  }
}
