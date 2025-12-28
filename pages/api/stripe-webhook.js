import Stripe from "stripe";
import { buffer } from "micro";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

export const config = {
  api: {
    bodyParser: false,
  },
};

const secretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function toDateOnlyFromUnix(unixSeconds) {
  if (!unixSeconds) return null;
  const d = new Date(unixSeconds * 1000);
  // YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

function mapStripeSubStatus(status) {
  // Stripe statuses: active, trialing, past_due, canceled, unpaid,
  // incomplete, incomplete_expired, paused
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  if (status === "paused") return "past_due";
  // incomplete -> treat as pending
  return "pending";
}

async function upsertSubscriptionFromCheckoutSession({ stripe, supabaseAdmin, session }) {
  const stripeCheckoutSessionId = session.id;
  const stripeCustomerId = session.customer ? String(session.customer) : null;
  const stripeSubscriptionId = session.subscription ? String(session.subscription) : null;

  // We only handle subscription checkouts here
  if (!stripeSubscriptionId) return;

  // Pull subscription to get status + current period dates
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);

  const status = mapStripeSubStatus(sub.status);
  const start_date = toDateOnlyFromUnix(sub.current_period_start);
  const next_collection_date = toDateOnlyFromUnix(sub.current_period_end);

  // Metadata comes from your create-subscription-session endpoint
  const md = session.metadata || {};
  const frequency = String(md.frequency || "weekly");
  const extraBags = Number(md.extraBags ?? 0);
  const useOwnBin = String(md.useOwnBin || "no") === "yes";

  const row = {
    stripe_checkout_session_id: stripeCheckoutSessionId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    status,

    name: md.name || null,
    email: session.customer_details?.email || session.customer_email || md.email || null,
    phone: md.phone || null,

    postcode: md.postcode || null,
    address: md.address || null,

    frequency,
    extra_bags: Number.isFinite(extraBags) ? extraBags : 0,
    use_own_bin: useOwnBin,

    route_day: md.routeDay || null,
    route_area: md.routeArea || null,

    start_date,
    next_collection_date,

    payload: {
      source: "checkout.session.completed",
      frequency,
      extraBags: Number.isFinite(extraBags) ? extraBags : 0,
      useOwnBin,
      routeDay: md.routeDay || "",
      routeArea: md.routeArea || "",
    },
  };

  // Upsert by stripe_subscription_id (unique) if present, otherwise by checkout session id (unique)
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" });

  if (error) {
    // fallback: some edge cases if stripe_subscription_id isn't present (rare)
    const { error: e2 } = await supabaseAdmin
      .from("subscriptions")
      .upsert(row, { onConflict: "stripe_checkout_session_id" });

    if (e2) throw new Error(`Supabase subscription upsert failed: ${e2.message}`);
  }
}

async function updateSubscriptionStatusFromStripe({ stripe, supabaseAdmin, stripeSubscriptionId }) {
  if (!stripeSubscriptionId) return;

  const sub = await stripe.subscriptions.retrieve(String(stripeSubscriptionId));
  const status = mapStripeSubStatus(sub.status);

  const start_date = toDateOnlyFromUnix(sub.current_period_start);
  const next_collection_date = toDateOnlyFromUnix(sub.current_period_end);

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status,
      start_date,
      next_collection_date,
      stripe_customer_id: sub.customer ? String(sub.customer) : null,
    })
    .eq("stripe_subscription_id", String(stripeSubscriptionId));

  if (error) throw new Error(`Supabase subscription update failed: ${error.message}`);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  if (!secretKey || !secretKey.startsWith("sk_")) {
    return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
  }
  if (!webhookSecret) {
    return res.status(500).json({ error: "Missing STRIPE_WEBHOOK_SECRET" });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(500).json({
      error:
        "Supabase not configured. Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

  let event;
  try {
    const rawBody = await buffer(req);
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err?.message || err);
    return res.status(400).send(`Webhook Error: ${err?.message || "Invalid signature"}`);
  }

  try {
    // ---------------------------
    // SUBSCRIPTION EVENTS
    // ---------------------------
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // Only handle subscription checkouts in this handler block
      if (session?.mode === "subscription") {
        await upsertSubscriptionFromCheckoutSession({ stripe, supabaseAdmin, session });
      }

      // If you also handle one-off bookings here in YOUR existing webhook,
      // keep that logic below (or leave it in your current file).
      // This file intentionally does not touch bookings.

      return res.status(200).json({ received: true });
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object;
      await updateSubscriptionStatusFromStripe({
        stripe,
        supabaseAdmin,
        stripeSubscriptionId: invoice.subscription,
      });
      return res.status(200).json({ received: true });
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      await updateSubscriptionStatusFromStripe({
        stripe,
        supabaseAdmin,
        stripeSubscriptionId: invoice.subscription,
      });
      return res.status(200).json({ received: true });
    }

    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      await updateSubscriptionStatusFromStripe({
        stripe,
        supabaseAdmin,
        stripeSubscriptionId: sub.id,
      });
      return res.status(200).json({ received: true });
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      await updateSubscriptionStatusFromStripe({
        stripe,
        supabaseAdmin,
        stripeSubscriptionId: sub.id,
      });
      return res.status(200).json({ received: true });
    }

    // Ignore other events
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("stripe-webhook handler error:", err);
    // Stripe expects 2xx generally; but if we return 500 Stripe will retry (good for reliability)
    return res.status(500).json({ error: "Webhook handler failed", detail: err?.message || "" });
  }
}
