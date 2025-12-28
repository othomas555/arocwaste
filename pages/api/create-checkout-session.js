import Stripe from "stripe";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

const secretKey = process.env.STRIPE_SECRET_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!secretKey || !secretKey.startsWith("sk_")) {
    return res.status(500).json({
      error:
        "Missing or invalid STRIPE_SECRET_KEY in Vercel Environment Variables (must start with sk_).",
    });
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

  try {
    const body = req.body || {};

    const title = body.title;
    const email = body.email;
    const postcode = body.postcode;
    const address = body.address;
    const date = body.date;

    const totalPounds = Number(body.total);

    if (!title || !email || !postcode || !address || !date) {
      return res.status(400).json({ error: "Missing required booking fields" });
    }
    if (!Number.isFinite(totalPounds) || totalPounds <= 0) {
      return res.status(400).json({ error: "Invalid total amount" });
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const totalPence = Math.round(totalPounds * 100);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: totalPence,
            product_data: {
              name: `AROC Waste – ${title}`,
              description: `Collection on ${date}`,
            },
          },
        },
      ],
      metadata: {
        title: String(body.title ?? ""),
        base: String(body.base ?? ""),
        time: String(body.time ?? ""),
        timeAdd: String(body.timeAdd ?? ""),
        remove: String(body.remove ?? ""),
        removeAdd: String(body.removeAdd ?? ""),
        date: String(body.date ?? ""),
        routeDay: String(body.routeDay ?? ""),
        routeArea: String(body.routeArea ?? ""),
        name: String(body.name ?? ""),
        phone: String(body.phone ?? ""),
        postcode: String(body.postcode ?? ""),
        address: String(body.address ?? ""),
        notes: String(body.notes ?? ""),
        total: String(body.total ?? ""),
      },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel`,
    });

    // ✅ Store pending booking in Supabase (idempotent via stripe_session_id unique)
    const payload = {
      title: String(body.title ?? ""),
      base: Number(body.base ?? 0),
      time: String(body.time ?? ""),
      timeAdd: Number(body.timeAdd ?? 0),
      remove: String(body.remove ?? ""),
      removeAdd: Number(body.removeAdd ?? 0),
      date: String(body.date ?? ""),
      routeDay: String(body.routeDay ?? ""),
      routeArea: String(body.routeArea ?? ""),
      name: String(body.name ?? ""),
      phone: String(body.phone ?? ""),
      postcode: String(body.postcode ?? ""),
      address: String(body.address ?? ""),
      notes: String(body.notes ?? ""),
      total: Number(body.total ?? 0),
    };

    const { error: upsertErr } = await supabaseAdmin
      .from("bookings")
      .upsert(
        {
          stripe_session_id: session.id,
          payment_status: "pending",
          title: String(body.title ?? ""),
          collection_date: String(body.date ?? ""),
          name: String(body.name ?? ""),
          email: String(body.email ?? ""),
          phone: String(body.phone ?? ""),
          postcode: String(body.postcode ?? ""),
          address: String(body.address ?? ""),
          notes: String(body.notes ?? ""),
          route_day: String(body.routeDay ?? ""),
          route_area: String(body.routeArea ?? ""),
          total_pence: totalPence,
          payload,
        },
        { onConflict: "stripe_session_id" }
      );

    if (upsertErr) {
      console.error("Supabase upsert error:", upsertErr.message);
      // Don't block checkout — payment can still proceed even if storage fails
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    const msg =
      err?.raw?.message ||
      err?.message ||
      "Stripe session creation failed (unknown error)";
    console.error("Stripe error:", msg);
    return res.status(500).json({ error: msg });
  }
}
