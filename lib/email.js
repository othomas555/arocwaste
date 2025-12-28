import { Resend } from "resend";

export function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function money(pence) {
  if (typeof pence !== "number") return "";
  return `£${(pence / 100).toFixed(2)}`;
}

export function buildCustomerEmail(booking) {
  const p = booking.payload || {};
  const lines = [
    `Booking reference: ${booking.booking_ref}`,
    `Item: ${booking.title}`,
    p.qty ? `Quantity: ${p.qty}` : null,
    `Collection date: ${booking.collection_date}`,
    p.time ? `Time option: ${p.time}` : null,
    p.remove ? `Remove from property: ${p.remove}` : null,
    `Postcode: ${booking.postcode}`,
    `Address: ${booking.address}`,
    booking.notes ? `Notes: ${booking.notes}` : null,
    `Total paid: ${money(booking.total_pence)}`,
  ].filter(Boolean);

  const subject = `AROC Waste booking confirmed — ${booking.booking_ref}`;

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; line-height:1.4;">
      <h2 style="margin:0 0 12px;">Booking confirmed ✅</h2>
      <p style="margin:0 0 14px;">Thanks — your payment has been received and your booking is confirmed.</p>

      <div style="border:1px solid #e5e7eb; border-radius:12px; padding:14px; margin:16px 0;">
        <div style="color:#6b7280; font-size:12px;">Booking reference</div>
        <div style="font-size:20px; font-weight:700;">${booking.booking_ref}</div>
        <div style="margin-top:10px; color:#111827; font-size:14px;">
          ${lines.map(l => `<div style="margin:4px 0;">${l}</div>`).join("")}
        </div>
      </div>

      <p style="margin:16px 0 0; color:#6b7280; font-size:12px;">
        If you need to make changes, reply to this email.
      </p>
    </div>
  `;

  const text = `Booking confirmed ✅\n\n${lines.join("\n")}\n`;

  return { subject, html, text };
}

export function buildAdminEmail(booking) {
  const p = booking.payload || {};
  const subject = `NEW PAID BOOKING — ${booking.booking_ref} — ${booking.postcode}`;

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; line-height:1.4;">
      <h2 style="margin:0 0 12px;">New paid booking ✅</h2>
      <div style="border:1px solid #e5e7eb; border-radius:12px; padding:14px;">
        <p style="margin:0 0 6px;"><b>${booking.booking_ref}</b> — ${booking.title}</p>
        <p style="margin:0 0 6px;">Date: <b>${booking.collection_date}</b></p>
        ${p.time ? `<p style="margin:0 0 6px;">Time: <b>${p.time}</b></p>` : ""}
        ${p.remove ? `<p style="margin:0 0 6px;">Remove: <b>${p.remove}</b></p>` : ""}
        ${p.qty ? `<p style="margin:0 0 6px;">Quantity: <b>${p.qty}</b></p>` : ""}
        <p style="margin:0 0 6px;">Customer: <b>${booking.name || ""}</b> (${booking.email}) ${booking.phone || ""}</p>
        <p style="margin:0 0 6px;">Postcode: <b>${booking.postcode}</b></p>
        <p style="margin:0 0 6px;">Address: <b>${booking.address}</b></p>
        ${booking.notes ? `<p style="margin:0 0 6px;">Notes: <b>${booking.notes}</b></p>` : ""}
        <p style="margin:10px 0 0;">Total: <b>${money(booking.total_pence)}</b></p>
      </div>
    </div>
  `;

  const text = `NEW PAID BOOKING\nRef: ${booking.booking_ref}\nItem: ${booking.title}\nDate: ${booking.collection_date}\nPostcode: ${booking.postcode}\nAddress: ${booking.address}\nTotal: ${money(booking.total_pence)}\n`;

  return { subject, html, text };
}
