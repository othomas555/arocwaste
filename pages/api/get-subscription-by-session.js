import Stripe from "stripe";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

const secretKey = process.env.STRIPE_SECRET_KEY;

function mapStripeSubStatus(status) {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  if (status === "paused") return "past_due";
  return "pending";
}

function toDateOnlyFromUnix(unixSeconds) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!secretKey || !secretKey.startsWith("sk_")) {
    return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
  }

  const { session_id } = req.body || {};
  if (!session_id) return res.status(400).json({ error: "Missing session_id" });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (!session) return res.status(404).json({ error: "Stripe session not found" });

    if (session.mode !== "subscription") {
      return res.status(400).json({ error: "This session is not a subscription checkout." });
    }

    const subscriptionId = session.subscription ? String(session.subscription) : null;
    const customerId = session.customer ? String(session.customer) : null;

    let status = "pending";
    let start_date = null;
    let next_collection_date = null;

    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      status = mapStripeSubStatus(sub.status);
      start_date = toDateOnlyFromUnix(sub.current_period_start);
      next_collection_date = toDateOnlyFromUnix(sub.current_period_end);
    }

    // Update the row we created pre-checkout (best effort)
    await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          stripe_checkout_session_id: session_id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status,
          start_date,
          next_collection_date,
        },
        { onConflict: "stripe_checkout_session_id" }
      );

    // Return full record (prefer by subscription_id if present)
    let subRow = null;

    if (subscriptionId) {
      const { data } = await supabaseAdmin
        .from("subscriptions")
        .select("*")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();
      subRow = data || null;
    } else {
      const { data } = await supabaseAdmin
        .from("subscriptions")
        .select("*")
        .eq("stripe_checkout_session_id", session_id)
        .maybeSingle();
      subRow = data || null;
    }

    return res.status(200).json({ ok: true, subscription: subRow });
  } catch (err) {
    const msg = err?.raw?.message || err?.message || "Could not confirm subscription";
    console.error("get-subscription-by-session error:", msg);
    return res.status(500).json({ error: msg });
  }
}
