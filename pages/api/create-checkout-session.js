import Stripe from "stripe";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

const secretKey = process.env.STRIPE_SECRET_KEY;

function clampQty(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.max(1, Math.min(50, Math.trunc(x)));
}

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

    const mode = String(body.mode || "single"); // "single" or "basket"

    const email = body.email;
    const postcode = body.postcode;
    const address = body.address;
    const date = body.date;

    const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    // Shared totals
    const totalPounds = Number(body.total);
    if (!Number.isFinite(totalPounds) || totalPounds <= 0) {
      return res.status(400).json({ error: "Invalid total amount" });
    }
    const totalPence = Math.round(totalPounds * 100);

    // ---- BASKET MODE ----
    if (mode === "basket") {
      const items = Array.isArray(body.items) ? body.items : [];

      if (!email || !postcode || !address || !date) {
        return res.status(400).json({ error: "Missing required booking fields" });
      }
      if (!items.length) {
        return res.status(400).json({ error: "Basket is empty" });
      }

      const cleanItems = items
        .filter((x) => x && x.title)
        .map((x) => ({
          id: String(x.id || ""),
          category: String(x.category || ""),
          slug: String(x.slug || ""),
          title: String(x.title || ""),
          unitPrice: Number(x.unitPrice || 0),
          qty: clampQty(x.qty),
        }))
        .filter((x) => x.qty >= 1);

      if (!cleanItems.length) {
        return res.status(400).json({ error: "Basket is empty" });
      }

      // Add-ons
      const timeAdd = Number(body.timeAdd ?? 0);
      const removeAdd = Number(body.removeAdd ?? 0);

      // Stripe line items: one per basket item (+ add-ons as separate items if > 0)
      // IMPORTANT: To guarantee totals match UI, we also include an "Order total adjustment" line if needed.
      // (This prevents rounding/price drift causing mismatch.)
      const lineItems = [];

      for (const it of cleanItems) {
        const unitPence = Math.round((Number(it.unitPrice) || 0) * 100);
        if (unitPence <= 0) continue;

        lineItems.push({
          quantity: it.qty,
          price_data: {
            currency: "gbp",
            unit_amount: unitPence,
            product_data: {
              name: `AROC Waste – ${it.title}`,
              description: it.category ? `Category: ${it.category}` : undefined,
            },
          },
        });
      }

      if (Number.isFinite(timeAdd) && timeAdd > 0) {
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: Math.round(timeAdd * 100),
            product_data: { name: "Time option" },
          },
        });
      }

      if (Number.isFinite(removeAdd) && removeAdd > 0) {
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: Math.round(removeAdd * 100),
            product_data: { name: "Remove from property" },
          },
        });
      }

      // Verify computed stripe total vs UI total; add adjustment if needed
      const computedPence = lineItems.reduce((sum, li) => {
        const qty = Number(li.quantity) || 0;
        const amt = Number(li.price_data?.unit_amount) || 0;
        return sum + qty * amt;
      }, 0);

      const diff = totalPence - computedPence;
      if (diff !== 0) {
        // Only allow small adjustments. If huge mismatch, error out.
        if (Math.abs(diff) > 500) {
          return res.status(400).json({
            error:
              "Price mismatch between basket items and total. Please refresh and try again.",
          });
        }

        lineItems.push({
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: diff,
            product_data: {
              name: "Order adjustment",
              description: "Auto-adjust to match checkout total",
            },
          },
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: email,
        line_items: lineItems,

        metadata: {
          mode: "basket",
          items_json: JSON.stringify(cleanItems).slice(0, 4500), // Stripe metadata limit safety
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

      // Supabase upsert (best effort)
      try {
        const supabaseAdmin = getSupabaseAdmin();

        if (supabaseAdmin) {
          const payload = {
            mode: "basket",
            items: cleanItems,
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
                title: "Basket order",
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

          if (upsertErr) console.error("Supabase upsert error:", upsertErr.message);
        } else {
          console.warn(
            "Supabase not configured (SUPABASE_URL / SERVICE_ROLE missing). Skipping DB save."
          );
        }
      } catch (e) {
        console.error("Supabase save failed:", e?.message || e);
      }

      return res.status(200).json({ url: session.url });
    }

    // ---- SINGLE MODE (existing behaviour) ----
    const title = body.title;

    // ✅ Quantity (default 1)
    const qtyRaw = Number(body.qty ?? 1);
    const qty = Number.isInteger(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;

    if (!title || !email || !postcode || !address || !date) {
      return res.status(400).json({ error: "Missing required booking fields" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,

      // Keep 1 line-item that represents the whole booking total
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: totalPence,
            product_data: {
              name: `AROC Waste – ${title} (x${qty})`,
              description: `Collection on ${date}`,
            },
          },
        },
      ],

      metadata: {
        mode: "single",
        title: String(body.title ?? ""),
        qty: String(qty),
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

    // Supabase upsert (best effort)
    try {
      const supabaseAdmin = getSupabaseAdmin();

      if (supabaseAdmin) {
        const payload = {
          mode: "single",
          title: String(body.title ?? ""),
          qty,
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

        if (upsertErr) console.error("Supabase upsert error:", upsertErr.message);
      } else {
        console.warn(
          "Supabase not configured (SUPABASE_URL / SERVICE_ROLE missing). Skipping DB save."
        );
      }
    } catch (e) {
      console.error("Supabase save failed:", e?.message || e);
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
