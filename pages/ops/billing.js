// pages/api/ops/billing-audit.js
import Stripe from "stripe";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const secretKey = process.env.STRIPE_SECRET_KEY;

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
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

  const expected = [{ kind: "bin", price: prices.bin, quantity: 1 }];

  const bags = clampInt(extraBags ?? 0, 0, 10);
  if (bags > 0) expected.push({ kind: "bags", price: prices.bag, quantity: bags });

  return expected;
}

function compare(expected, stripeItems) {
  const notes = [];
  let ok = true;

  const stripe = summarizeStripeItems(stripeItems);

  const expBin = expected.find((x) => x.kind === "bin");
  const expBags = expected.find((x) => x.kind === "bags");

  const stripeBinMatch = stripe.find((s) => s.price === expBin.price);
  if (!stripeBinMatch) {
    ok = false;
    notes.push(`Missing bin price ${expBin.price}`);
  } else if (Number(stripeBinMatch.quantity || 0) !== 1) {
    ok = false;
    notes.push(`Bin qty ${stripeBinMatch.quantity} (expected 1)`);
  }

  if (expBags) {
    const stripeBagMatch = stripe.find((s) => s.price === expBags.price);
    if (!stripeBagMatch) {
      ok = false;
      notes.push(`Missing bag price ${expBags.price}`);
    } else if (Number(stripeBagMatch.quantity || 0) !== expBags.quantity) {
      ok = false;
      notes.push(`Bag qty ${stripeBagMatch.quantity} (expected ${expBags.quantity})`);
    }
  } else {
    // expect no bags -> if any known bag price exists, mismatch
    const bagPrices = new Set(
      [
        process.env.STRIPE_PRICE_BAG_WEEKLY,
        process.env.STRIPE_PRICE_BAG_FORTNIGHTLY,
        process.env.STRIPE_PRICE_BAG_THREEWEEKLY,
      ].filter(Boolean)
    );
    const hasBags = stripe.some((s) => s.price && bagPrices.has(s.price));
    if (hasBags) {
      ok = false;
      notes.push("Stripe has recurring bags but Supabase expects 0");
    }
  }

  // unexpected recurring items
  const expectedPriceSet = new Set(expected.map((e) => e.price));
  const unexpected = stripe.filter((s) => s.price && !expectedPriceSet.has(s.price));
  if (unexpected.length) {
    ok = false;
    notes.push(`Unexpected item(s): ${unexpected.map((u) => u.price).join(", ")}`);
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

  const limit = clampInt(req.body?.limit ?? 50, 1, 200);

  try {
    // Pull candidates: not ok OR never checked
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("id,email,frequency,extra_bags,status,stripe_subscription_id,billing_alignment_status,billing_alignment_checked_at")
      .in("status", ["active", "pending", "paused"])
      .order("billing_alignment_checked_at", { ascending: true, nullsFirst: true })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });

    const results = [];
    for (const s of subs || []) {
      const expected = computeExpected(s.frequency, s.extra_bags);
      if (!expected) {
        await writeStatus(supabase, s.id, "error", "Missing price mapping for frequency");
        results.push({ id: s.id, email: s.email, status: "error", notes: ["Missing price mapping"] });
        continue;
      }

      if (!s.stripe_subscription_id || !String(s.stripe_subscription_id).startsWith("sub_")) {
        await writeStatus(supabase, s.id, "error", "Missing stripe_subscription_id");
        results.push({ id: s.id, email: s.email, status: "error", notes: ["Missing stripe_subscription_id"] });
        continue;
      }

      try {
        const stripeSub = await stripe.subscriptions.retrieve(s.stripe_subscription_id, {
          expand: ["items.data.price"],
        });

        const cmp = compare(expected, stripeSub?.items?.data || []);
        const st = cmp.ok ? "ok" : "mismatch";
        await writeStatus(supabase, s.id, st, cmp.notes.join(" | "));

        results.push({
          id: s.id,
          email: s.email,
          aligned: cmp.ok,
          status: st,
          notes: cmp.notes,
        });
      } catch (e) {
        await writeStatus(supabase, s.id, "error", e?.message || "Stripe retrieve failed");
        results.push({
          id: s.id,
          email: s.email,
          aligned: false,
          status: "error",
          notes: [e?.message || "Stripe retrieve failed"],
        });
      }
    }

    return res.status(200).json({ ok: true, checked: results.length, results });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Audit failed" });
  }
}
