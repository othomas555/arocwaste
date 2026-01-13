// pages/api/ops/bookings/set-completed.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

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

  try {
    const body = req.body || {};
    const booking_id = String(body.booking_id || "").trim();
    const run_id = String(body.run_id || "").trim();
    const completed = !!body.completed;

    if (!booking_id) return res.status(400).json({ error: "Missing booking_id" });
    if (!run_id) return res.status(400).json({ error: "Missing run_id" });

    const patch = completed
      ? { completed_at: new Date().toISOString(), completed_by_run_id: run_id }
      : { completed_at: null, completed_by_run_id: null };

    const { data: bookingRow, error } = await supabase
      .from("bookings")
      .update(patch)
      .eq("id", booking_id)
      .select("*")
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        error: error.message,
        hint:
          "If this mentions missing columns completed_at/completed_by_run_id, add them to bookings (see SQL migration).",
      });
    }

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

    // completed=true -> enqueue email (1 hour delay) if valid recipient email exists
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
      completed_by_staff_email: "ops",
    };

    const scheduled_at = plusHoursISO(1);

    const { error: eIns } = await supabase.from("notification_queue").insert({
      event_type: "booking_completed",
      target_type: "booking",
      target_id: booking_id,
      recipient_email: recipient,
      scheduled_at,
      status: "pending",
      payload,
    });

    if (eIns && !String(eIns.message || "").toLowerCase().includes("duplicate")) {
      return res.status(500).json({ error: eIns.message });
    }

    return res.status(200).json({ ok: true, notification: "queued", scheduled_at });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to update booking" });
  }
}
