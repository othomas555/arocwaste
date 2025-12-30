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

function isISODate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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
    const body = req.body || {};
    const action = String(body.action || "");
    const subscriptionId = body.subscriptionId;

    if (!subscriptionId || typeof subscriptionId !== "string") {
      return res.status(400).json({ error: "Missing subscriptionId" });
    }

    const supabase = getSupabaseAdmin();

    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("id, email, stripe_subscription_id, status")
      .eq("id", subscriptionId)
      .single();

    if (error) throw new Error(error.message);
    if (!sub || String(sub.email || "").toLowerCase() !== email) {
      return res.status(403).json({ error: "Not allowed" });
    }

    if (action === "pause") {
      const pauseTo = body.pauseTo;
      if (!isISODate(pauseTo)) return res.status(400).json({ error: "pauseTo must be YYYY-MM-DD" });

      // Stripe: pause billing if we have a stripe subscription id
      if (stripe && sub.stripe_subscription_id) {
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          pause_collection: { behavior: "keep_as_draft" },
        });
      }

      const { error: upErr } = await supabase
        .from("subscriptions")
        .update({
          status: "paused",
          pause_from: new Date().toISOString().slice(0, 10),
          pause_to: pauseTo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriptionId);

      if (upErr) throw new Error(upErr.message);

      return res.status(200).json({ ok: true });
    }

    if (action === "resume") {
      if (stripe && sub.stripe_subscription_id) {
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          pause_collection: "",
        });
      }

      const { error: upErr } = await supabase
        .from("subscriptions")
        .update({
          status: "active",
          pause_from: null,
          pause_to: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriptionId);

      if (upErr) throw new Error(upErr.message);

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Bad request" });
  }
}
