import Stripe from "stripe";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

export const config = {
  api: {
    bodyParser: false, // IMPORTANT: Stripe needs the raw body
  },
};

const secretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  if (!secretKey || !secretKey.startsWith("sk_")) {
    return res.status(500).send("Missing STRIPE_SECRET_KEY");
  }
  if (!webhookSecret) {
    return res.status(500).send("Missing STRIPE_WEBHOOK_SECRET");
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

  let event;

  try {
    const rawBody = await buffer(req);
    const sig = req.headers["stripe-signature"];

    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err?.message || err);
    return res.status(400).send(`Webhook Error: ${err?.message || "Invalid signature"}`);
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      console.error("❌ Supabase not configured on server");
      return res.status(500).send("Supabase not configured");
    }

    // We mainly care about successful checkout completion
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const sessionId = session.id;
      const paymentStatus = session.payment_status; // should be 'paid' for card
      const paymentIntentId = session.payment_intent || null;
      const totalPence = session.amount_total ?? 0;

      // Only mark paid when actually paid
      if (paymentStatus === "paid") {
        // Update existing booking if created already (pending at checkout creation)
        const { data: updated, error: updErr } = await supabaseAdmin
          .from("bookings")
          .update({
            payment_status: "paid",
            stripe_payment_intent_id: paymentIntentId,
            total_pence: totalPence,
          })
          .eq("stripe_session_id", sessionId)
          .select("booking_ref")
          .maybeSingle();

        if (updErr) {
          console.error("❌ Supabase update error:", updErr.message);
          // Don't throw; Stripe will retry. Better to fail loudly though:
          return res.status(500).send("Supabase update failed");
        }

        // If no row existed (edge case), insert it now from metadata
        if (!updated) {
          const md = session.metadata || {};

          const { error: insErr } = await supabaseAdmin.from("bookings").insert({
            stripe_session_id: sessionId,
            stripe_payment_intent_id: paymentIntentId,
            payment_status: "paid",
            title: md.title || "AROC Waste Booking",
            collection_date: md.date || "",
            name: md.name || "",
            email: session.customer_details?.email || session.customer_email || md.email || "",
            phone: md.phone || "",
            postcode: md.postcode || "",
            address: md.address || "",
            notes: md.notes || "",
            route_day: md.routeDay || "",
            route_area: md.routeArea || "",
            total_pence: totalPence,
            payload: md || null,
          });

          if (insErr) {
            console.error("❌ Supabase insert error:", insErr.message);
            return res.status(500).send("Supabase insert failed");
          }
        }
      }
    }

    // Optional: mark failed/cancelled if you want later:
    // - checkout.session.expired
    // - payment_intent.payment_failed
    // Keeping minimal for now.

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    return res.status(500).send("Webhook handler failed");
  }
}
