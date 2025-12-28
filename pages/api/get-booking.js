import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const bookingRef = String(req.query.bookingRef || "").trim();
    if (!bookingRef) return res.status(400).json({ error: "Missing bookingRef" });

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(500).json({ error: "Supabase not configured" });

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "booking_ref, payment_status, title, collection_date, name, email, phone, postcode, address, notes, route_day, route_area, total_pence, payload, created_at"
      )
      .eq("booking_ref", bookingRef)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Booking not found" });

    return res.status(200).json({ ok: true, booking: data });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
