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

function isPausedOnDate(row, dateISO) {
  // If no pause window set, not paused
  const from = row.pause_from;
  const to = row.pause_to;

  if (!from && !to) return false;

  // Interpret as:
  // - if pause_from only: paused from that date onwards
  // - if pause_to only: paused until that date (inclusive)
  // - if both: paused for inclusive range [from, to]
  if (from && !to) return dateISO >= from;
  if (!from && to) return dateISO <= to;
  return dateISO >= from && dateISO <= to;
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

    const selectCols =
      "id,status,name,email,phone,postcode,address,frequency,extra_bags,use_own_bin,route_day,route_area,route_id,driver_id,next_collection_date,pause_from,pause_to,ops_notes";

    // Fetch due-today rows (date column)
    const { data, error } = await supabase
      .from("subscriptions")
      .select(selectCols)
      .eq("next_collection_date", today)
      .in("status", ["active", "trialing"]); // ONLY collectable statuses

    if (error) return res.status(400).json({ error: error.message });

    // Remove paused rows in code (simpler + correct + readable)
    const subscriptions = (data || [])
      .filter((row) => !isPausedOnDate(row, today))
      .sort((a, b) => {
        const aa = `${a.route_area || ""} ${a.postcode || ""} ${a.address || ""}`.toLowerCase();
        const bb = `${b.route_area || ""} ${b.postcode || ""} ${b.address || ""}`.toLowerCase();
        return aa.localeCompare(bb);
      });

    return res.status(200).json({
      date: today,
      detected_next_collection_date: "date-like",
      subscriptions,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
