import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ✅ Fail fast with a useful message
  if (!secretKey || !secretKey.startsWith("sk_")) {
    return res.status(500).json({
      error:
        "Missing or invalid STRIPE_SECRET_KEY in Vercel Environment Variables (must start with sk_).",
    });
  }

  const stripe = new Stripe(secretKey);

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

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: Math.round(totalPounds * 100),
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

    return res.status(200).json({ url: session.url });
  } catch (err) {
    // ✅ Return the real Stripe error message (massively speeds up debugging)
    const msg =
      err?.raw?.message ||
      err?.message ||
      "Stripe session creation failed (unknown error)";
    console.error("Stripe error:", msg);
    return res.status(500).json({ error: msg });
  }
}
