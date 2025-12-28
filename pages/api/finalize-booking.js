import Stripe from "stripe";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

const secretKey = process.env.STRIPE_SECRET_KEY;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (!secretKey || !secretKey.startsWith("sk_")) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
    }

    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: "Missing session_id" });

    const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent"],
    });

    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.payment_status !== "paid") {
      return res.status(402).json({
        error: "Payment not completed",
        payment_status: session.payment_status,
      });
    }

    // Fetch existing booking row
    const { data: existing, error: getErr } = await supabaseAdmin
      .from("bookings")
      .select("id, booking_ref, payment_status")
      .eq("stripe_session_id", session_id)
      .maybeSingle();

    if (getErr) return res.status(500).json({ error: getErr.message });

    // If it doesn't exist (should exist), create minimal record
    if (!existing) {
      const { data: created, error: insErr } = await supabaseAdmin
        .from("bookings")
        .insert({
          stripe_session_id: session_id,
          payment_status: "paid",
          stripe_payment_intent_id: session.payment_intent?.id || null,
          title: session.metadata?.title || "AROC Waste Booking",
          collection_date: session.metadata?.date || "",
          email: session.customer_details?.email || session.customer_email || "",
          postcode: session.metadata?.postcode || "",
          address: session.metadata?.address || "",
          total_pence: session.amount_total ?? 0,
          payload: session.metadata || null,
        })
        .select("booking_ref")
        .single();

      if (insErr) return res.status(500).json({ error: insErr.message });

      return res.status(200).json({
        ok: true,
        bookingRef: created.booking_ref,
      });
    }

    // If already paid, just return (idempotent)
    if (existing.payment_status === "paid") {
      return res.status(200).json({ ok: true, bookingRef: existing.booking_ref });
    }

    // Mark as paid
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("bookings")
      .update({
        payment_status: "paid",
        stripe_payment_intent_id: session.payment_intent?.id || null,
      })
      .eq("stripe_session_id", session_id)
      .select("booking_ref")
      .single();

    if (updErr) return res.status(500).json({ error: updErr.message });

    return res.status(200).json({
      ok: true,
      bookingRef: updated.booking_ref,
    });
  } catch (err) {
    console.error("finalize-booking error:", err);
    return res.status(500).json({ error: "Server error finalizing booking" });
  }
}
