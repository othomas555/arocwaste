import Stripe from "stripe";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

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

    // 1) Verify session is paid
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent"],
    });

    if (!session) return res.status(404).json({ error: "Stripe session not found" });

    if (session.payment_status !== "paid") {
      return res.status(402).json({
        error: "Payment not completed",
        payment_status: session.payment_status,
      });
    }

    // 2) Supabase admin client
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({
        error:
          "Supabase not configured in Vercel env vars. Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.",
      });
    }

    // 3) Fetch booking row by stripe_session_id
    const { data: existing, error: getErr } = await supabaseAdmin
      .from("bookings")
      .select("id, booking_ref, payment_status")
      .eq("stripe_session_id", session_id)
      .maybeSingle();

    if (getErr) {
      return res.status(500).json({
        error: "Supabase select failed",
        detail: getErr.message,
      });
    }

    // 4) If missing, create it from Stripe metadata (fallback)
    if (!existing) {
      const { data: created, error: insErr } = await supabaseAdmin
        .from("bookings")
        .insert({
          stripe_session_id: session_id,
          stripe_payment_intent_id: session.payment_intent?.id || null,
          payment_status: "paid",
          title: session.metadata?.title || "AROC Waste Booking",
          collection_date: session.metadata?.date || "",
          name: session.metadata?.name || "",
          email:
            session.customer_details?.email ||
            session.customer_email ||
            session.metadata?.email ||
            "",
          phone: session.metadata?.phone || "",
          postcode: session.metadata?.postcode || "",
          address: session.metadata?.address || "",
          notes: session.metadata?.notes || "",
          route_day: session.metadata?.routeDay || "",
          route_area: session.metadata?.routeArea || "",
          total_pence: session.amount_total ?? 0,
          payload: session.metadata || null,
        })
        .select("booking_ref")
        .single();

      if (insErr) {
        return res.status(500).json({
          error: "Supabase insert failed",
          detail: insErr.message,
        });
      }

      return res.status(200).json({ ok: true, bookingRef: created.booking_ref });
    }

    // 5) Idempotent
    if (existing.payment_status === "paid") {
      return res.status(200).json({ ok: true, bookingRef: existing.booking_ref });
    }

    // 6) Mark as paid
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("bookings")
      .update({
        payment_status: "paid",
        stripe_payment_intent_id: session.payment_intent?.id || null,
      })
      .eq("stripe_session_id", session_id)
      .select("booking_ref")
      .single();

    if (updErr) {
      return res.status(500).json({
        error: "Supabase update failed",
        detail: updErr.message,
      });
    }

    return res.status(200).json({ ok: true, bookingRef: updated.booking_ref });
  } catch (err) {
    // ✅ Return the real error message
    const msg = err?.message || "Unknown server error";
    console.error("finalize-booking error:", err);
    return res.status(500).json({ error: "Server error finalizing booking", detail: msg });
  }
}
