import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      title,
      base,
      time,
      timeAdd,
      remove,
      removeAdd,
      date,
      routeDay,
      routeArea,
      name,
      email,
      phone,
      postcode,
      address,
      notes,
      total,
    } = req.body || {};

    // Basic validation
    if (!title || !email || !postcode || !address || !date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const totalPounds = safeNumber(total, 0);
    if (totalPounds <= 0) {
      return res.status(400).json({ error: "Invalid total" });
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
              description: `Collection on ${date}${routeDay ? ` (${routeDay})` : ""}`,
            },
          },
        },
      ],
      metadata: {
        title: String(title),
        base: String(base ?? ""),
        time: String(time ?? ""),
        timeAdd: String(timeAdd ?? ""),
        remove: String(remove ?? ""),
        removeAdd: String(removeAdd ?? ""),
        date: String(date ?? ""),
        routeDay: String(routeDay ?? ""),
        routeArea: String(routeArea ?? ""),
        name: String(name ?? ""),
        phone: String(phone ?? ""),
        postcode: String(postcode ?? ""),
        address: String(address ?? ""),
        notes: String(notes ?? ""),
        total: String(total ?? ""),
      },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Stripe session creation failed" });
  }
}
