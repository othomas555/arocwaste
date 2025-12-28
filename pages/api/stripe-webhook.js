import Stripe from "stripe";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

export const config = {
  api: {
    bodyParser: false, // REQUIRED for Stripe signature verification
  },
};

const secretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// ---- helpers ----
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function toDateOnlyFromUnix(unixSeconds) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function mapStripeSubStatus(status) {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  if (status === "paused") return "past_due";
  return "pending";
}

// ---- subscription upsert from checkout ----
async function upsertSubscriptionFromCheckoutSession({ stripe, supabaseAdmin, session }) {
  if (!session.subscription) return;

  const subscriptionId = String(session.subscription);
  const customerId = session.customer ? String(session.customer) : null;

  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  const md = session.metadata || {};
  const status = mapStripeSubStatus(sub.status);

  const row = {
    stripe_checkout_session_id: session.id,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    status,

    name: md.name || null,
    email:
      session.customer_details?.email ||
      session.customer_email ||
      md.email ||
      null,
    phone: md.phone || null,

    postcode: md.postcode || null,
    address: md.address || null,

    frequency: md.frequency || "weekly",
    extra_bags: Number(md.extraBags ?? 0),
    use_own_bin: md.useOwnBin === "yes",

    route_day: md.routeDay || null,
    route_area: md.routeArea || null,

    start_date: toDateOnlyFromUnix(sub.current_period_start),
    next_collection_date: toDateOnlyFromUnix(sub.current_period_end),

    payload: {
      source: "checkout.session.completed",
      frequency: md.frequency,
      extraBags: Number(md.extraBags ?? 0),
      useOwnBin: md.useOwnBin === "yes",
      routeDay: md.routeDay || "",
      routeArea: md.routeArea || "",
    },
  };

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" });

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }
}

// ---- subscription status updates ----
async function updateSubscriptionStatus({ stripe, supabaseAdmin, subscriptionId }) {
  if (!subscriptionId) return;

  const sub = await stripe.subscriptions.retrieve(String(subscriptionId));

  const status = mapStripeSubStatus(sub.status);

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status,
      start_date: toDateOnlyFromUnix(sub.current_period_start),
      next_collection_date: toDateOnlyFromUnix(sub.current_period_end),
      stripe_customer_id: sub.customer ? String(sub.customer) : null,
    })
    .eq("stripe_subscription_id", String(subscriptionId));

  if (error) {
    throw new Error(`Supabase update failed: ${error.message}`);
  }
}

// ---- handler ----
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
      error: "Supabase not configured (service role missing)",
    });
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

  let event;
  try {
    const rawBody = await readRawBody(req);
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature error:", err?.message || err);
    return res.status(400).send("Webhook signature verification failed");
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription") {
          await upsertSubscriptionFromCheckoutSession({
            stripe,
            supabaseAdmin,
            session,
          });
        }
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        await updateSubscriptionStatus({
          stripe,
          supabaseAdmin,
          subscriptionId: invoice.subscription,
        });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await updateSubscriptionStatus({
          stripe,
          supabaseAdmin,
          subscriptionId: sub.id,
        });
        break;
      }

      default:
        // ignore
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("stripe-webhook handler error:", err);
    // Return 500 so Stripe retries (safe)
    return res.status(500).json({ error: "Webhook handler failed" });
  }
}
