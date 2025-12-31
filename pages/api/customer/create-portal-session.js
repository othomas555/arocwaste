import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" })
  : null;

function getAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!stripe) return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    const authClient = getAuthClient();
    if (!authClient) return res.status(500).json({ error: "Auth client not configured" });

    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user?.email) return res.status(401).json({ error: "Invalid session" });

    const email = userData.user.email.toLowerCase();
    const body = req.body || {};
    const subscriptionId = body.subscriptionId;

    if (!subscriptionId || typeof subscriptionId !== "string") {
      return res.status(400).json({ error: "Missing subscriptionId" });
    }

    const supabase = getSupabaseAdmin();
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("id, email, stripe_customer_id, stripe_subscription_id")
      .eq("id", subscriptionId)
      .single();

    if (error) throw new Error(error.message);
    if (!sub || String(sub.email || "").toLowerCase() !== email) {
      return res.status(403).json({ error: "Not allowed" });
    }

    let stripeCustomerId = sub.stripe_customer_id || null;

    if (!stripeCustomerId && sub.stripe_subscription_id) {
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      stripeCustomerId =
        typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id;
    }

    if (!stripeCustomerId) {
      return res.status(400).json({ error: "No Stripe customer found for this subscription" });
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      (req.headers.origin ? String(req.headers.origin) : "https://www.arocwaste.co.uk");

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${siteUrl}/my-bins`,
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Bad request" });
  }
}
