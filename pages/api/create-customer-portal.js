import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!secretKey || !secretKey.startsWith("sk_")) {
    return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
  }

  const { stripe_customer_id } = req.body || {};
  if (!stripe_customer_id) {
    return res.status(400).json({ error: "Missing stripe_customer_id" });
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const portal = await stripe.billingPortal.sessions.create({
      customer: String(stripe_customer_id),
      return_url: `${origin}/bins-bags`,
    });

    return res.status(200).json({ url: portal.url });
  } catch (err) {
    const msg = err?.raw?.message || err?.message || "Could not create portal session";
    console.error("create-customer-portal error:", msg);
    return res.status(500).json({ error: msg });
  }
}
