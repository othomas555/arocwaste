import Stripe from "stripe";
import { kv } from "@vercel/kv";
import { formatBookingRef, fallbackBookingRef } from "../../lib/bookingRef";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

function kvAvailable() {
  // @vercel/kv throws if not configured. We'll catch and fallback.
  return true;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { session_id } = req.body || {};
    if (!session_id) {
      return res.status(400).json({ error: "Missing session_id" });
    }

    // Verify session with Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent"],
    });

    if (!session) {
      return res.status(404).json({ error: "Checkout session not found" });
    }

    // Must be paid
    if (session.payment_status !== "paid") {
      return res.status(402).json({
        error: "Payment not completed",
        payment_status: session.payment_status,
      });
    }

    // If KV is available, make booking ref sequential + idempotent
    let bookingRef = null;
    let booking = null;

    try {
      // If we've already finalized this session, return the same ref
      const existingRef = await kv.get(`booking:session:${session_id}:ref`);
      if (existingRef) {
        bookingRef = existingRef;
        booking = await kv.get(`booking:ref:${bookingRef}`);
        return res.status(200).json({
          ok: true,
          bookingRef,
          booking,
          session: {
            id: session.id,
            amount_total: session.amount_total,
            currency: session.currency,
            customer_email: session.customer_details?.email || session.customer_email,
          },
        });
      }

      // Get pending booking payload (saved when session was created)
      const pending = await kv.get(`booking:pending:${session_id}`);

      // Generate next sequential number atomically
      const n = await kv.incr("booking:counter");
      bookingRef = formatBookingRef(n);

      // Build final booking record
      booking = {
        bookingRef,
        createdAt: new Date().toISOString(),
        stripe: {
          session_id: session.id,
          payment_intent: session.payment_intent?.id || null,
          amount_total: session.amount_total,
          currency: session.currency,
        },
        customer: {
          name: pending?.customer?.name || session.customer_details?.name || "",
          email:
            pending?.customer?.email ||
            session.customer_details?.email ||
            session.customer_email ||
            "",
          phone: pending?.customer?.phone || session.customer_details?.phone || "",
          postcode: pending?.customer?.postcode || "",
          address: pending?.customer?.address || "",
        },
        booking: pending?.booking || null,
      };

      // Persist mapping + record
      await kv.set(`booking:session:${session_id}:ref`, bookingRef);
      await kv.set(`booking:ref:${bookingRef}`, booking);

      // Optional: keep pending for a while then delete
      // await kv.del(`booking:pending:${session_id}`);

      return res.status(200).json({
        ok: true,
        bookingRef,
        booking,
        session: {
          id: session.id,
          amount_total: session.amount_total,
          currency: session.currency,
          customer_email: session.customer_details?.email || session.customer_email,
        },
      });
    } catch (e) {
      // KV not configured — fallback
      bookingRef = fallbackBookingRef();
      return res.status(200).json({
        ok: true,
        bookingRef,
        booking: null,
        session: {
          id: session.id,
          amount_total: session.amount_total,
          currency: session.currency,
          customer_email: session.customer_details?.email || session.customer_email,
        },
        warning:
          "Vercel KV not configured, using fallback booking ref (not sequential) and not storing booking record.",
      });
    }
  } catch (err) {
    console.error("finalize-booking error:", err);
    return res.status(500).json({ error: "Server error finalizing booking" });
  }
}
