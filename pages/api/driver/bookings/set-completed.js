// pages/api/driver/bookings/set-completed.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function isEmail(s) {
  const x = String(s || "").trim();
  if (!x) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}

function plusHoursISO(hours) {
  const d = new Date();
  d.setHours(d.getHours() + Number(hours || 0));
  return d.toISOString();
}

function guessBookAgainUrl(bookingRow) {
  const blob = JSON.stringify(bookingRow || {}).toLowerCase();

  if (blob.includes("appliance")) return "https://www.arocwaste.co.uk/appliances";
  if (blob.includes("furniture")) return "https://www.arocwaste.co.uk/furniture";
  if (blob.includes("man") && blob.includes("van")) return "https://www.arocwaste.co.uk/man-van";

  // fallback: clearances page also useful for bulky jobs
  if (blob.includes("clearance")) return "https://www.arocwaste.co.uk/clearances";

  return "https://www.arocwaste.co.uk/";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const body = req.body || {};
  const booking_id = String(body.booking_id || "").trim();
  const run_id = String(body.run_id || "").trim();
  const completed = !!body.completed;

  if (!booking_id) return res.status(400).json({ error: "Missing booking_id" });
  if (!run_id) return res.status(400).json({ error: "Missing run_id" });

  try {
    // session
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid session" });

    const email = String(userData.user.email || "").trim().toLowerCase();
    if (!email) return res.status(401).json({ error: "No email on session" });

    // staff
    const { data: staffRow, error: eStaff } = await supabase
      .from("staff")
      .select("id,name,email,role,active")
      .ilike("email", email)
      .maybeSingle();

    if (eStaff) return res.status(500).json({ error: eStaff.message });
    if (!staffRow) return res.status(403).json({ error: "No staff record for this email" });
    if (staffRow.active === false) return res.status(403).json({ error: "Staff is inactive" });

    // must be assigned to run
    const { data: linkRow, error: eLink } = await supabase
      .from("daily_run_staff")
      .select("run_id, staff_id")
      .eq("run_id", run_id)
      .eq("staff_id", staffRow.id)
      .maybeSingle();

    if (eLink) return res.status(500).json({ error: eLink.message });
    if (!linkRow) return res.status(403).json({ error: "You are not assigned to this run" });

    // update booking (return full row so we can build email payload without guessing columns)
    const patch = completed
      ? { completed_at: new Date().toISOString(), completed_by_run_id: run_id }
      : { completed_at: null, completed_by_run_id: null };

    const { data: bookingRow, error: eUp } = await supabase
      .from("bookings")
      .update(patch)
      .eq("id", booking_id)
      .select("*")
      .maybeSingle();

    if (eUp) return res.status(500).json({ error: eUp.message });

    // If completed=false -> cancel any pending completion email
    if (!completed) {
      await supabase
        .from("notification_queue")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("event_type", "booking_completed")
        .eq("target_type", "booking")
        .eq("target_id", booking_id)
        .eq("status", "pending");
      return res.status(200).json({ ok: true, notification: "cancelled_if_pending" });
    }

    // completed=true -> enqueue email (1 hour delay) if we have a valid recipient email on the booking
    const recipient = String(bookingRow?.email || "").trim();
    if (!isEmail(recipient)) {
      return res.status(200).json({ ok: true, notification: "skipped_no_valid_email" });
    }

    const payload = {
      booking_id: booking_id,
      booking_ref: bookingRow?.booking_ref || bookingRow?.ref || bookingRow?.reference || "",
      name: bookingRow?.name || bookingRow?.customer_name || "",
      postcode: bookingRow?.postcode || "",
      address: bookingRow?.address || "",
      service_label: bookingRow?.title || bookingRow?.service_name || bookingRow?.item_name || "your collection",
      book_again_url: guessBookAgainUrl(bookingRow),
      review_url: process.env.GOOGLE_REVIEW_URL || "https://www.arocwaste.co.uk/",
      social_url: process.env.SOCIAL_URL || "https://www.arocwaste.co.uk/",
      reply_to: recipient,
      run_id: run_id,
      completed_by_staff_email: email,
    };

    const scheduled_at = plusHoursISO(1);

    // Dedupe is handled by the unique partial index (pending/sent). If it already exists, we ignore.
    const { error: eIns } = await supabase.from("notification_queue").insert({
      event_type: "booking_completed",
      target_type: "booking",
      target_id: booking_id,
      recipient_email: recipient,
      scheduled_at,
      status: "pending",
      payload,
    });

    // If duplicate, ignore — booking already queued/sent
    if (eIns && !String(eIns.message || "").toLowerCase().includes("duplicate")) {
      return res.status(500).json({ error: eIns.message });
    }

    return res.status(200).json({ ok: true, notification: "queued", scheduled_at });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to update booking" });
  }
}
