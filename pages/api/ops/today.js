import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function londonISODate(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // YYYY-MM-DD
}

function isValidISODate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();

    const dateParam = req.query?.date;
    const today = isValidISODate(dateParam) ? dateParam : londonISODate();

    // Minimal pause logic:
    // Include if not paused, OR pause window does not cover today.
    // (Handles nulls safely.)
    const { data, error } = await supabase
      .from("subscriptions")
      .select(
        "id,status,name,email,phone,postcode,address,frequency,extra_bags,use_own_bin,route_day,route_area,route_id,driver_id,next_collection_date,pause_from,pause_to,ops_notes"
      )
      .eq("next_collection_date", today)
      .in("status", ["active", "trialing"]) // keep flexible
      .or(`pause_from.is.null,pause_to.is.null,pause_from.gt.${today},pause_to.lt.${today}`);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Sort: area > postcode > address (driver-friendly)
    const subscriptions = (data || []).sort((a, b) => {
      const aa = `${a.route_area || ""} ${a.postcode || ""} ${a.address || ""}`.toLowerCase();
      const bb = `${b.route_area || ""} ${b.postcode || ""} ${b.address || ""}`.toLowerCase();
      return aa.localeCompare(bb);
    });

    return res.status(200).json({ date: today, subscriptions });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
