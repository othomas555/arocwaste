import Stripe from "stripe";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";
import {
  getResend,
  getResendFrom,
  buildCustomerSubscriptionEmail,
  buildAdminSubscriptionEmail,
} from "../../lib/subscriptionEmails";

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

async function sendSubscriptionEmailsOnce({ supabaseAdmin, subRow }) {
  if (!subRow) return;

  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY missing; skipping subscription emails.");
    return;
  }

  const from = getResendFrom();
  const adminTo = process.env.AROC_ADMIN_EMAIL || "";

  // Customer email (once)
  if (!subRow.customer_email_sent_at && subRow.email) {
    const customerEmail = buildCustomerSubscriptionEmail(subRow);

    await resend.emails.send({
      from: `AROC Waste <${from}>`,
      to: subRow.email,
      subject: customerEmail.subject,
      html: customerEmail.html,
      text: customerEmail.text,
    });

    await supabaseAdmin
      .from("subscriptions")
      .update({ customer_email_sent_at: new Date().toISOString() })
      .eq("id", subRow.id);
  }

  // Admin email (once)
  if (!subRow.admin_email_sent_at && adminTo) {
    const adminEmail = buildAdminSubscriptionEmail(subRow);

    await resend.emails.send({
      from: `AROC Waste <${from}>`,
      to: adminTo,
      subject: adminEmail.subject,
      html: adminEmail.html,
      text: adminEmail.text,
    });

    await supabaseAdmin
      .from("subscriptions")
      .update({ admin_email_sent_at: new Date().toISOString() })
      .eq("id", subRow.id);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!secretKey || !secretKey.startsWith("sk_")) {
    return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
  }

  const { session_id } = req.body || {};
  if (!session_id) return res.status(400).json({ error: "Missing session_id" });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase not configured" });

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

    const md = session.metadata || {};

    // 1) Try to find existing row by checkout session id
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("stripe_checkout_session_id", session_id)
      .maybeSingle();

    if (existing) {
      const { error: updErr } = await supabaseAdmin
        .from("subscriptions")
        .update({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status,
          start_date,
          next_collection_date,
        })
        .eq("stripe_checkout_session_id", session_id);

      if (updErr) throw new Error(updErr.message);
    } else {
      const insertRow = {
        stripe_checkout_session_id: session_id,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        status,

        name: md.name || null,
        email: session.customer_details?.email || session.customer_email || md.email || null,
        phone: md.phone || null,

        postcode: md.postcode || null,
        address: md.address || null,

        frequency: md.frequency || "weekly",
        extra_bags: Number(md.extraBags ?? 0),
        use_own_bin: md.useOwnBin === "yes",

        route_day: md.routeDay || null,
        route_area: md.routeArea || null,

        start_date,
        next_collection_date,

        payload: md || null,
      };

      const { error: insErr } = await supabaseAdmin.from("subscriptions").insert(insertRow);
      if (insErr) throw new Error(insErr.message);
    }

    // 2) Fetch the saved row (prefer by subscription id)
    let subRow = null;

    if (subscriptionId) {
      const { data } = await supabaseAdmin
        .from("subscriptions")
        .select("*")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();
      subRow = data || null;
    }

    if (!subRow) {
      const { data } = await supabaseAdmin
        .from("subscriptions")
        .select("*")
        .eq("stripe_checkout_session_id", session_id)
        .maybeSingle();
      subRow = data || null;
    }

    // ✅ Email fallback here (ensures you get emails even if webhook isn’t firing)
    await sendSubscriptionEmailsOnce({ supabaseAdmin, subRow });

    return res.status(200).json({ ok: true, subscription: subRow });
  } catch (err) {
    const msg = err?.raw?.message || err?.message || "Could not confirm subscription";
    console.error("get-subscription-by-session error:", msg);
    return res.status(500).json({ error: msg });
  }
}
