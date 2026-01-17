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

function getCronAuthToken(req) {
  // Prefer standard Authorization: Bearer <token>
  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m) return String(m[1] || "").trim();

  // Fallback to existing patterns
  const xh = String(req.headers["x-cron-secret"] || "").trim();
  if (xh) return xh;

  const qs = String(req.query.secret || "").trim();
  if (qs) return qs;

  return "";
}

/**
 * Replace {{key}} placeholders with values from payload.
 * - Unknown keys become ""
 * - Values are stringified
 * - Simple + predictable (no logic, no loops)
 */
function renderTemplate(str, payload) {
  const src = String(str || "");
  const data = payload && typeof payload === "object" ? payload : {};
  return src.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = data[key];
    if (v === null || v === undefined) return "";
    return String(v);
  });
}

async function loadEmailTemplateOverride(supabase, eventType) {
  const et = String(eventType || "").trim();
  if (!et) return null;

  const { data, error } = await supabase
    .from("email_templates")
    .select("event_type, subject, body_html, body_text")
    .eq("event_type", et)
    .maybeSingle();

  if (error) return null; // fail soft (fallback to code templates)
  return data || null;
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

function buildSubscriptionCollectedEmail(payload) {
  const name = safeText(payload?.name, "there");
  const postcode = safeText(payload?.postcode, "");
  const address = safeText(payload?.address, "");
  const collectedDate = safeText(payload?.collected_date, "");
  const service = safeText(payload?.service_label, "your wheelie bin collection");

  const bookAgainUrl = safeText(payload?.book_again_url, "https://www.arocwaste.co.uk/bins-bags");
  const reviewUrl = safeText(payload?.review_url, "https://www.arocwaste.co.uk/");
  const socialUrl = safeText(payload?.social_url, "https://www.arocwaste.co.uk/");

  const subject = `✅ Bin collected — thanks from AROC Waste`;

  const dateLine = collectedDate
    ? `<p style="margin:0 0 10px 0;"><strong>Date:</strong> ${collectedDate}</p>`
    : "";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.4;">
      <h2 style="margin:0 0 12px 0;">✅ Bin collected</h2>
      <p style="margin:0 0 10px 0;">Hi ${name},</p>
      <p style="margin:0 0 10px 0;">
        We’ve completed ${service}${postcode ? ` in <strong>${postcode}</strong>` : ""}.
      </p>
      ${dateLine}
      ${address ? `<p style="margin:0 0 10px 0;"><strong>Address:</strong> ${address}</p>` : ""}

      <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />

      <p style="margin:0 0 10px 0;"><strong>Need bags / another service?</strong></p>
      <p style="margin:0 0 14px 0;">
        <a href="${bookAgainUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;">
          Book again
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

  // Protect with CRON_SECRET
  const secret = process.env.CRON_SECRET || "";
  if (secret) {
    const got = getCronAuthToken(req);
    if (got !== secret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const supabase = getSupabaseAdmin();

  // Fetch due notifications
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from("notification_queue")
    .select("id,event_type,target_type,target_id,recipient_email,payload,scheduled_at,status,cancelled_at,sent_at")
    .eq("status", "pending")
    .is("cancelled_at", null)
    .is("sent_at", null)
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
    if (n.status !== "pending" || n.cancelled_at || n.sent_at) {
      skipped++;
      continue;
    }

    let subject = "AROC Waste update";
    let html = "<p>Update</p>";
    let replyTo = safeText(n.payload?.reply_to, "");

    // 1) Try template override
    const tpl = await loadEmailTemplateOverride(supabase, n.event_type);
    if (tpl && tpl.subject && tpl.body_html) {
      subject = renderTemplate(tpl.subject, n.payload || {});
      html = renderTemplate(tpl.body_html, n.payload || {});
    } else {
      // 2) Fallback to built-in templates (existing behaviour)
      if (n.event_type === "booking_completed") {
        const built = buildBookingCompletedEmail(n.payload || {});
        subject = built.subject;
        html = built.html;
      } else if (n.event_type === "subscription_collected") {
        const built = buildSubscriptionCollectedEmail(n.payload || {});
        subject = built.subject;
        html = built.html;
      } else {
        await supabase
          .from("notification_queue")
          .update({ status: "failed", last_error: "Unknown event_type", sent_at: null })
          .eq("id", n.id);
        failed++;
        continue;
      }
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
