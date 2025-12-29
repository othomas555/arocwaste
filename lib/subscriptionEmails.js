import { Resend } from "resend";

export function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export function getResendFrom() {
  // Use a verified sender. Set RESEND_FROM in Vercel.
  return process.env.RESEND_FROM || "onboarding@resend.dev";
}

function prettyFrequency(f) {
  if (f === "weekly") return "Weekly";
  if (f === "fortnightly") return "Fortnightly";
  if (f === "threeweekly") return "Three-weekly";
  return f || "—";
}

export function buildCustomerSubscriptionEmail(sub) {
  const subject = `AROC Waste subscription confirmed`;

  const lines = [
    `Status: ${sub.status}`,
    `Service: 240L bin emptying`,
    `Frequency: ${prettyFrequency(sub.frequency)}`,
    `Extra bags: ${sub.extra_bags ?? 0}`,
    `Bin: ${sub.use_own_bin ? "Using own bin (no deposit)" : "Deposit paid (our bin)"}`,
    sub.route_day ? `Collection day: ${sub.route_day}${sub.route_area ? ` (${sub.route_area})` : ""}` : null,
    `Postcode: ${sub.postcode}`,
    `Address: ${sub.address}`,
  ].filter(Boolean);

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; line-height:1.45;">
      <h2 style="margin:0 0 10px;">Subscription confirmed ✅</h2>
      <p style="margin:0 0 14px;">
        Thanks — your subscription is active.
      </p>

      <div style="border:1px solid #e5e7eb; border-radius:12px; padding:14px; margin:16px 0;">
        <div style="color:#6b7280; font-size:12px;">Subscription details</div>
        <div style="margin-top:10px; color:#111827; font-size:14px;">
          ${lines.map(l => `<div style="margin:4px 0;">${l}</div>`).join("")}
        </div>
      </div>

      <p style="margin:16px 0 0; color:#6b7280; font-size:12px;">
        If anything needs changing, reply to this email.
      </p>
    </div>
  `;

  const text = `Subscription confirmed ✅\n\n${lines.join("\n")}\n`;

  return { subject, html, text };
}

export function buildAdminSubscriptionEmail(sub) {
  const subject = `NEW BIN SUBSCRIPTION — ${sub.postcode} — ${prettyFrequency(sub.frequency)}`;

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; line-height:1.45;">
      <h2 style="margin:0 0 10px;">New subscription ✅</h2>
      <div style="border:1px solid #e5e7eb; border-radius:12px; padding:14px;">
        <p style="margin:0 0 6px;"><b>${sub.email}</b> ${sub.phone ? `(${sub.phone})` : ""}</p>
        <p style="margin:0 0 6px;">Address: <b>${sub.address}</b></p>
        <p style="margin:0 0 6px;">Postcode: <b>${sub.postcode}</b></p>
        <p style="margin:0 0 6px;">Frequency: <b>${prettyFrequency(sub.frequency)}</b></p>
        <p style="margin:0 0 6px;">Extra bags: <b>${sub.extra_bags ?? 0}</b></p>
        <p style="margin:0 0 6px;">Bin: <b>${sub.use_own_bin ? "Own bin" : "Our bin (deposit)"}</b></p>
        ${sub.route_day ? `<p style="margin:0 0 6px;">Route: <b>${sub.route_day}${sub.route_area ? ` (${sub.route_area})` : ""}</b></p>` : ""}
        <p style="margin:10px 0 0; color:#6b7280; font-size:12px;">
          Stripe subscription: ${sub.stripe_subscription_id || "—"}
        </p>
      </div>
    </div>
  `;

  const text =
    `NEW BIN SUBSCRIPTION\n` +
    `Email: ${sub.email}\n` +
    `Phone: ${sub.phone || ""}\n` +
    `Address: ${sub.address}\n` +
    `Postcode: ${sub.postcode}\n` +
    `Frequency: ${prettyFrequency(sub.frequency)}\n` +
    `Extra bags: ${sub.extra_bags ?? 0}\n` +
    `Bin: ${sub.use_own_bin ? "Own bin" : "Our bin (deposit)"}\n` +
    (sub.route_day ? `Route: ${sub.route_day}${sub.route_area ? ` (${sub.route_area})` : ""}\n` : "");

  return { subject, html, text };
}
