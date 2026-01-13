// pages/api/cron/send-notifications.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

async function sendResendEmail({ to, subject, html, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true, reason: "Missing RESEND_API_KEY" };

  try {
    const mod = await import("resend");
    const Resend = mod?.Resend;
    if (!Resend) return { ok: false, skipped: true, reason: "Resend SDK not available" };

    const resend = new Resend(key);

    const from = process.env.RESEND_FROM || "AROC Waste <no-reply@arocwaste.co.uk>";

    const payload = {
      from,
      to,
      subject,
      html,
    };

    if (replyTo) payload.reply_to = replyTo;

    const out = await resend.emails.send(payload);
    return { ok: true, out };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function safeText(x, fallback = "") {
  const s = String(x ?? "").trim();
  return s || fallback;
}

function buildBookingCompletedEmail(payload) {
  const name = safeText(payload?.name, "there");
  const bookingRef = safeText(payload?.booking_ref, "");
  const service = safeText(payload?.service_label, "your collection");
  const postcode = safeText(payload?.postcode, "");
  const address = safeText(payload?.address, "");

  const bookAgainUrl = safeText(payload?.book_again_url, "https://www.arocwaste.co.uk/");
  const reviewUrl = safeText(payload?.review_url, "https://www.arocwaste.co.uk/");
  const socialUrl = safeText(payload?.social_url, "https://www.arocwaste.co.uk/");

  const subject = `✅ Job complete — thanks from AROC Waste${bookingRef ? ` (${bookingRef})` : ""}`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.4;">
      <h2 style="margin:0 0 12px 0;">✅ Job complete</h2>
      <p style="margin:0 0 10px 0;">Hi ${name},</p>
      <p style="margin:0 0 10px 0;">
        We’ve completed ${service}${postcode ? ` in <strong>${postcode}</strong>` : ""}.
      </p>
      ${bookingRef ? `<p style="margin:0 0 10px 0;"><strong>Booking ref:</strong> ${bookingRef}</p>` : ""}
      ${address ? `<p style="margin:0 0 10px 0;"><strong>Address:</strong> ${address}</p>` : ""}

      <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />

      <p style="margin:0 0 10px 0;"><strong>Want to book another?</strong></p>
      <p style="margin:0 0 14px 0;">
        <a href="${bookAgainUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;">
          Book another job
        </a>
      </p>

      <p style="margin:0 0 10px 0;"><strong>Happy with the service?</strong></p>
      <p style="margin:0 0 14px 0;">
        <a href="${reviewUrl}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;">
          Leave a Google review
        </a>
      </p>

      <p style="margin:0 0 10px 0;">
        Share AROC Waste:
        <a href="${socialUrl}">${socialUrl}</a>
      </p>

      <p style="margin:16px 0 0 0;color:#666;font-size:12px;">
        If this was marked complete by mistake, please reply to this email.
      </p>
    </div>
  `;

  return { subject, html };
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Optional: protect with a secret for cron calls
  const secret = process.env.CRON_SECRET || "";
  if (secret) {
    const got = String(req.headers["x-cron-secret"] || req.query.secret || "");
    if (got !== secret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const supabase = getSupabaseAdmin();

  // Fetch due notifications
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from("notification_queue")
    .select("id,event_type,target_type,target_id,recipient_email,payload,scheduled_at,status")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });

  const items = Array.isArray(rows) ? rows : [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const n of items) {
    // Safety: if it was cancelled between fetch + send, skip it.
    if (n.status !== "pending") {
      skipped++;
      continue;
    }

    let subject = "AROC Waste update";
    let html = "<p>Update</p>";
    let replyTo = "";

    if (n.event_type === "booking_completed") {
      const built = buildBookingCompletedEmail(n.payload || {});
      subject = built.subject;
      html = built.html;
      replyTo = safeText(n.payload?.reply_to, "");
    } else {
      // Unknown type — fail it so it doesn’t loop forever
      await supabase
        .from("notification_queue")
        .update({ status: "failed", last_error: "Unknown event_type", sent_at: null })
        .eq("id", n.id);
      failed++;
      continue;
    }

    const result = await sendResendEmail({
      to: n.recipient_email,
      subject,
      html,
      replyTo: replyTo || undefined,
    });

    if (result.ok) {
      await supabase
        .from("notification_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
        .eq("id", n.id);
      sent++;
    } else if (result.skipped) {
      // If Resend not configured, mark failed with reason (so we can see it in DB)
      await supabase
        .from("notification_queue")
        .update({ status: "failed", last_error: result.reason || "Email skipped" })
        .eq("id", n.id);
      failed++;
    } else {
      await supabase
        .from("notification_queue")
        .update({ status: "failed", last_error: result.error || "Email send failed" })
        .eq("id", n.id);
      failed++;
    }
  }

  return res.status(200).json({
    ok: true,
    processed: items.length,
    sent,
    failed,
    skipped,
  });
}
