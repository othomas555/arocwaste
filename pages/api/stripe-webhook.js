import Stripe from "stripe";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";
import { getResend, buildCustomerEmail, buildAdminEmail } from "../../lib/email";

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
    return res
      .status(400)
      .send(`Webhook Error: ${err?.message || "Invalid signature"}`);
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      console.error("❌ Supabase not configured on server");
      return res.status(500).send("Supabase not configured");
    }

    // Stripe now sometimes hides event names in the UI,
    // but the actual event.type still comes through as checkout.session.completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const sessionId = session.id;
      const paymentStatus = session.payment_status; // 'paid' for card
      const paymentIntentId = session.payment_intent || null;
      const totalPence = session.amount_total ?? 0;

      if (paymentStatus === "paid") {
        // 1) Mark paid (idempotent update)
        const { data: updated, error: updErr } = await supabaseAdmin
          .from("bookings")
          .update({
            payment_status: "paid",
            stripe_payment_intent_id: paymentIntentId,
            total_pence: totalPence,
          })
          .eq("stripe_session_id", sessionId)
          .select("id, booking_ref")
          .maybeSingle();

        if (updErr) {
          console.error("❌ Supabase update error:", updErr.message);
          return res.status(500).send("Supabase update failed");
        }

        // 2) If missing row (edge case), insert it now from metadata
        if (!updated) {
          const md = session.metadata || {};
          const { data: inserted, error: insErr } = await supabaseAdmin
            .from("bookings")
            .insert({
              stripe_session_id: sessionId,
              stripe_payment_intent_id: paymentIntentId,
              payment_status: "paid",
              title: md.title || "AROC Waste Booking",
              collection_date: md.date || "",
              name: md.name || "",
              email:
                session.customer_details?.email ||
                session.customer_email ||
                md.email ||
                "",
              phone: md.phone || "",
              postcode: md.postcode || "",
              address: md.address || "",
              notes: md.notes || "",
              route_day: md.routeDay || "",
              route_area: md.routeArea || "",
              total_pence: totalPence,
              payload: md || null,
            })
            .select("id, booking_ref")
            .single();

          if (insErr) {
            console.error("❌ Supabase insert error:", insErr.message);
            return res.status(500).send("Supabase insert failed");
          }

          // Use inserted row for emailing
          await sendEmailsIfNeeded(supabaseAdmin, inserted.id);
        } else {
          // Use updated row for emailing
          await sendEmailsIfNeeded(supabaseAdmin, updated.id);
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    return res.status(500).send("Webhook handler failed");
  }
}

async function sendEmailsIfNeeded(supabaseAdmin, bookingId) {
  // Pull full row
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();

  if (error || !booking) {
    console.error("❌ Could not load booking for email:", error?.message || "missing row");
    throw new Error("Could not load booking for email");
  }

  const resend = getResend();
  const from = process.env.EMAIL_FROM;
  const notifyTo = process.env.EMAIL_NOTIFY_TO;
  const replyTo = process.env.EMAIL_REPLY_TO || notifyTo || undefined;

  if (!resend || !from) {
    console.warn("Email not configured (missing RESEND_API_KEY or EMAIL_FROM). Skipping send.");
    return;
  }

  // 1) Customer email (once)
  if (!booking.customer_email_sent && booking.email) {
    const { subject, html, text } = buildCustomerEmail(booking);

    try {
      await resend.emails.send({
        from,
        to: booking.email,
        subject,
        html,
        text,
        replyTo,
      });

      const { error: u1 } = await supabaseAdmin
        .from("bookings")
        .update({
          customer_email_sent: true,
          customer_email_sent_at: new Date().toISOString(),
        })
        .eq("id", booking.id);

      if (u1) throw new Error(u1.message);
    } catch (e) {
      console.error("❌ Customer email send failed:", e?.message || e);
      // Throw so webhook returns 500 and Stripe retries
      throw new Error("Customer email failed");
    }
  }

  // 2) Admin email (once)
  if (notifyTo && !booking.admin_email_sent) {
    const { subject, html, text } = buildAdminEmail(booking);

    try {
      await resend.emails.send({
        from,
        to: notifyTo,
        subject,
        html,
        text,
        replyTo,
      });

      const { error: u2 } = await supabaseAdmin
        .from("bookings")
        .update({
          admin_email_sent: true,
          admin_email_sent_at: new Date().toISOString(),
        })
        .eq("id", booking.id);

      if (u2) throw new Error(u2.message);
    } catch (e) {
      console.error("❌ Admin email send failed:", e?.message || e);
      throw new Error("Admin email failed");
    }
  }
}
