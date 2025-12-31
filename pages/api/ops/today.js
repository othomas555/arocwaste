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

function dayBoundsLondonISO(dateISO) {
  // Build UTC bounds that correspond to the London day.
  // We avoid external deps and keep this simple:
  // Use local "midnight" labels and let Postgres compare consistently.
  // We will query >= dateISO 00:00:00 and < nextDay 00:00:00.
  const [y, m, d] = dateISO.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  const next = new Date(dt);
  next.setUTCDate(next.getUTCDate() + 1);

  const toIso = (x) => x.toISOString().slice(0, 10);

  // Use date-only strings; Postgres will cast safely for timestamp/date columns.
  // For timestamp columns, we'll use explicit datetime strings.
  const startDate = dateISO;
  const endDate = toIso(next);

  const startTs = `${startDate}T00:00:00.000Z`;
  const endTs = `${endDate}T00:00:00.000Z`;

  return { startDate, endDate, startTs, endTs };
}

function valueLooksLikeTimestamp(v) {
  if (!v) return false;
  const s = String(v);
  return s.includes("T") && (s.includes(":") || s.includes("+") || s.includes("Z"));
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

    // --- Auto-detect whether next_collection_date looks like a timestamp ---
    // Pull one non-null value and inspect its shape (no schema introspection needed)
    const { data: sampleRows, error: sampleErr } = await supabase
      .from("subscriptions")
      .select("next_collection_date")
      .not("next_collection_date", "is", null)
      .limit(1);

    if (sampleErr) {
      return res.status(400).json({ error: sampleErr.message });
    }

    const sampleVal =
      Array.isArray(sampleRows) && sampleRows.length ? sampleRows[0]?.next_collection_date : null;

    const isTimestampLike = valueLooksLikeTimestamp(sampleVal);

    const {
      startDate,
      endDate,
      startTs,
      endTs,
    } = dayBoundsLondonISO(today);

    // Common select
    const selectCols =
      "id,status,name,email,phone,postcode,address,frequency,extra_bags,use_own_bin,route_day,route_area,route_id,driver_id,next_collection_date,pause_from,pause_to,ops_notes";

    // Build query based on detected storage style:
    // - date: eq(next_collection_date, today)
    // - timestamp: range [today 00:00, nextday 00:00)
    let q = supabase
      .from("subscriptions")
      .select(selectCols)
      .in("status", ["active", "trialing"]);

    if (isTimestampLike) {
      q = q.gte("next_collection_date", startTs).lt("next_collection_date", endTs);
    } else {
      q = q.eq("next_collection_date", startDate);
    }

    // Minimal pause logic:
    // Include if not paused OR pause window does not cover today.
    // Keep this tolerant of nulls.
    q = q.or(
      `pause_from.is.null,pause_to.is.null,pause_from.gt.${startDate},pause_to.lt.${startDate}`
    );

    const { data, error } = await q;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const subscriptions = (data || []).sort((a, b) => {
      const aa = `${a.route_area || ""} ${a.postcode || ""} ${a.address || ""}`.toLowerCase();
      const bb = `${b.route_area || ""} ${b.postcode || ""} ${b.address || ""}`.toLowerCase();
      return aa.localeCompare(bb);
    });

    return res.status(200).json({
      date: today,
      detected_next_collection_date: isTimestampLike ? "timestamp-like" : "date-like",
      subscriptions,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
