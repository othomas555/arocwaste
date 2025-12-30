import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;

function getAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    const authClient = getAuthClient();
    if (!authClient) return res.status(500).json({ error: "Auth client not configured" });

    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user?.email) return res.status(401).json({ error: "Invalid session" });

    const email = userData.user.email.toLowerCase();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id, status, frequency, extra_bags, address, postcode, next_collection_date, pause_from, pause_to, stripe_customer_id")
      .eq("email", email)
      .in("status", ["active", "trialing", "paused"]);

    if (error) throw new Error(error.message);

    // Optional: attach Stripe portal URL if you have an endpoint already; otherwise omit
    const subscriptions = await Promise.all(
      (data || []).map(async (s) => {
        let portal_url = null;

        // If you already have a portal session endpoint, swap this to use it.
        // For now, we only include it if you already store it somewhere else.
        // (We keep this field so the UI stays stable.)
        if (stripe && s.stripe_customer_id) {
          // NOTE: we are not creating a portal session here to avoid extra moving parts.
          // You can plug your existing portal link generator into this later.
          portal_url = null;
        }

        return { ...s, portal_url };
      })
    );

    return res.status(200).json({ subscriptions });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Bad request" });
  }
}
