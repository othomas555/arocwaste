import { Resend } from "resend";

export function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function money(pence) {
  const num = Number(pence);
  if (!Number.isFinite(num)) return "";
  return `£${(num / 100).toFixed(2)}`;
}

function moneyGBP(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "£0.00";
  return `£${num.toFixed(2)}`;
}

function safeItemsFromPayload(payload) {
  if (!payload || payload.mode !== "basket") return [];
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items
    .filter((x) => x && x.title)
    .map((x) => ({
      title: String(x.title),
      qty: Math.max(1, Number(x.qty || 1)),
      unitPrice: Number(x.unitPrice || 0),
      category: String(x.category || ""),
    }));
}

function basketSubtotal(items) {
  return items.reduce((sum, it) => {
    const qty = Number(it.qty) || 0;
    const unit = Number(it.unitPrice) || 0;
    return sum + qty * unit;
  }, 0);
}

function prettyTimeOption(key) {
  if (key === "morning") return "Morning";
  if (key === "afternoon") return "Afternoon";
  if (key === "twohour") return "2-hour slot";
  return "Any time";
}

export function buildCustomerEmail(booking) {
  const p = booking.payload || {};
  const isBasket = p.mode === "basket";
  const items = safeItemsFromPayload(p);

  const subject = `AROC Waste booking confirmed — ${booking.booking_ref}`;

  // --- SINGLE (existing) ---
  if (!isBasket) {
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

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; line-height:1.4;">
        <h2 style="margin:0 0 12px;">Booking confirmed ✅</h2>
        <p style="margin:0 0 14px;">Thanks — your payment has been received and your booking is confirmed.</p>

        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:14px; margin:16px 0;">
          <div style="color:#6b7280; font-size:12px;">Booking reference</div>
          <div style="font-size:20px; font-weight:700;">${booking.booking_ref}</div>
          <div style="margin-top:10px; color:#111827; font-size:14px;">
            ${lines.map((l) => `<div style="margin:4px 0;">${l}</div>`).join("")}
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

  // --- BASKET (multi-item) ---
  const sub = basketSubtotal(items);
  const timeAdd = Number(p.timeAdd ?? 0);
  const removeAdd = Number(p.removeAdd ?? 0);

  const lines = [
    `Booking reference: ${booking.booking_ref}`,
    `Collection date: ${booking.collection_date}`,
    `Time option: ${prettyTimeOption(p.time)}${timeAdd > 0 ? ` (+${moneyGBP(timeAdd)})` : ""}`,
    `Remove from property: ${p.remove === "yes" ? "Yes" : "No"}${removeAdd > 0 ? ` (+${moneyGBP(removeAdd)})` : ""}`,
    `Postcode: ${booking.postcode}`,
    `Address: ${booking.address}`,
    booking.notes ? `Notes: ${booking.notes}` : null,
    `Total paid: ${money(booking.total_pence)}`,
  ].filter(Boolean);

  const itemsHtml = items
    .map((it) => {
      const line = (Number(it.unitPrice) || 0) * (Number(it.qty) || 0);
      return `
        <tr>
          <td style="padding:10px 0; border-top:1px solid #e5e7eb;">
            <div style="font-weight:600; color:#111827;">${it.title}</div>
            <div style="font-size:12px; color:#6b7280;">
              ${it.category ? `${it.category} • ` : ""}${moneyGBP(it.unitPrice)} each
            </div>
          </td>
          <td style="padding:10px 0; border-top:1px solid #e5e7eb; text-align:right; color:#111827;">
            ${it.qty}
          </td>
          <td style="padding:10px 0; border-top:1px solid #e5e7eb; text-align:right; font-weight:600; color:#111827;">
            ${moneyGBP(line)}
          </td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; line-height:1.4;">
      <h2 style="margin:0 0 12px;">Booking confirmed ✅</h2>
      <p style="margin:0 0 14px;">Thanks — your payment has been received and your booking is confirmed.</p>

      <div style="border:1px solid #e5e7eb; border-radius:12px; padding:14px; margin:16px 0;">
        <div style="color:#6b7280; font-size:12px;">Booking reference</div>
        <div style="font-size:20px; font-weight:700;">${booking.booking_ref}</div>

        <div style="margin-top:12px;">
          <div style="font-weight:700; color:#111827; margin-bottom:8px;">Items</div>
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <thead>
              <tr>
                <th style="text-align:left; font-size:12px; color:#6b7280; font-weight:600; padding-bottom:8px;">Item</th>
                <th style="text-align:right; font-size:12px; color:#6b7280; font-weight:600; padding-bottom:8px;">Qty</th>
                <th style="text-align:right; font-size:12px; color:#6b7280; font-weight:600; padding-bottom:8px;">Line</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div style="margin-top:12px; border-top:1px solid #e5e7eb; padding-top:12px; font-size:14px;">
            <div style="display:flex; justify-content:space-between; margin:4px 0;">
              <span style="color:#6b7280;">Items subtotal</span>
              <span style="font-weight:600; color:#111827;">${moneyGBP(sub)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin:4px 0;">
              <span style="color:#6b7280;">Time option</span>
              <span style="font-weight:600; color:#111827;">${moneyGBP(timeAdd)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin:4px 0;">
              <span style="color:#6b7280;">Remove from property</span>
              <span style="font-weight:600; color:#111827;">${moneyGBP(removeAdd)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin:8px 0 0;">
              <span style="font-weight:800; color:#111827;">Total paid</span>
              <span style="font-weight:800; color:#111827;">${money(booking.total_pence)}</span>
            </div>
          </div>

          <div style="margin-top:12px; color:#111827; font-size:14px;">
            ${lines.map((l) => `<div style="margin:4px 0;">${l}</div>`).join("")}
          </div>
        </div>
      </div>

      <p style="margin:16px 0 0; color:#6b7280; font-size:12px;">
        If you need to make changes, reply to this email.
      </p>
    </div>
  `;

  const textItems = items
    .map((it) => {
      const line = (Number(it.unitPrice) || 0) * (Number(it.qty) || 0);
      return `- ${it.title} x${it.qty} @ ${moneyGBP(it.unitPrice)} = ${moneyGBP(line)}`;
    })
    .join("\n");

  const text = `Booking confirmed ✅\n\nItems:\n${textItems}\n\n${lines.join("\n")}\n`;

  return { subject, html, text };
}

export function buildAdminEmail(booking) {
  const p = booking.payload || {};
  const isBasket = p.mode === "basket";
  const subject = `NEW PAID BOOKING — ${booking.booking_ref} — ${booking.postcode}`;

  // --- SINGLE (existing) ---
  if (!isBasket) {
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

  // --- BASKET (multi-item) ---
  const items = safeItemsFromPayload(p);
  const sub = basketSubtotal(items);
  const timeAdd = Number(p.timeAdd ?? 0);
  const removeAdd = Number(p.removeAdd ?? 0);

  const itemsHtml = items
    .map((it) => {
      const line = (Number(it.unitPrice) || 0) * (Number(it.qty) || 0);
      return `
        <tr>
          <td style="padding:10px 0; border-top:1px solid #e5e7eb;">
            <div style="font-weight:600; color:#111827;">${it.title}</div>
            <div style="font-size:12px; color:#6b7280;">
              ${it.category ? `${it.category} • ` : ""}${moneyGBP(it.unitPrice)} each
            </div>
          </td>
          <td style="padding:10px 0; border-top:1px solid #e5e7eb; text-align:right; color:#111827;">
            ${it.qty}
          </td>
          <td style="padding:10px 0; border-top:1px solid #e5e7eb; text-align:right; font-weight:600; color:#111827;">
            ${moneyGBP(line)}
          </td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; line-height:1.4;">
      <h2 style="margin:0 0 12px;">New paid basket booking ✅</h2>

      <div style="border:1px solid #e5e7eb; border-radius:12px; padding:14px;">
        <p style="margin:0 0 6px;"><b>${booking.booking_ref}</b> — Basket order</p>
        <p style="margin:0 0 6px;">Date: <b>${booking.collection_date}</b></p>
        <p style="margin:0 0 6px;">Time: <b>${prettyTimeOption(p.time)}</b> ${timeAdd > 0 ? `( +${moneyGBP(timeAdd)} )` : ""}</p>
        <p style="margin:0 0 6px;">Remove: <b>${p.remove === "yes" ? "Yes" : "No"}</b> ${removeAdd > 0 ? `( +${moneyGBP(removeAdd)} )` : ""}</p>

        <p style="margin:0 0 6px;">Customer: <b>${booking.name || ""}</b> (${booking.email}) ${booking.phone || ""}</p>
        <p style="margin:0 0 6px;">Postcode: <b>${booking.postcode}</b></p>
        <p style="margin:0 0 6px;">Address: <b>${booking.address}</b></p>
        ${booking.notes ? `<p style="margin:0 0 6px;">Notes: <b>${booking.notes}</b></p>` : ""}

        <div style="margin-top:12px; border-top:1px solid #e5e7eb; padding-top:12px;">
          <div style="font-weight:700; color:#111827; margin-bottom:8px;">Items</div>
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <thead>
              <tr>
                <th style="text-align:left; font-size:12px; color:#6b7280; font-weight:600; padding-bottom:8px;">Item</th>
                <th style="text-align:right; font-size:12px; color:#6b7280; font-weight:600; padding-bottom:8px;">Qty</th>
                <th style="text-align:right; font-size:12px; color:#6b7280; font-weight:600; padding-bottom:8px;">Line</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div style="margin-top:12px; border-top:1px solid #e5e7eb; padding-top:12px; font-size:14px;">
            <div style="display:flex; justify-content:space-between; margin:4px 0;">
              <span style="color:#6b7280;">Items subtotal</span>
              <span style="font-weight:600; color:#111827;">${moneyGBP(sub)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin:4px 0;">
              <span style="color:#6b7280;">Time option</span>
              <span style="font-weight:600; color:#111827;">${moneyGBP(timeAdd)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin:4px 0;">
              <span style="color:#6b7280;">Remove from property</span>
              <span style="font-weight:600; color:#111827;">${moneyGBP(removeAdd)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin:8px 0 0;">
              <span style="font-weight:800; color:#111827;">Total paid</span>
              <span style="font-weight:800; color:#111827;">${money(booking.total_pence)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const textItems = items
    .map((it) => {
      const line = (Number(it.unitPrice) || 0) * (Number(it.qty) || 0);
      return `- ${it.title} x${it.qty} @ ${moneyGBP(it.unitPrice)} = ${moneyGBP(line)}`;
    })
    .join("\n");

  const text =
    `NEW PAID BASKET BOOKING\n` +
    `Ref: ${booking.booking_ref}\n` +
    `Date: ${booking.collection_date}\n` +
    `Postcode: ${booking.postcode}\n` +
    `Address: ${booking.address}\n` +
    `Customer: ${booking.name || ""} (${booking.email}) ${booking.phone || ""}\n\n` +
    `Items:\n${textItems}\n\n` +
    `Items subtotal: ${moneyGBP(sub)}\n` +
    `Time option: ${moneyGBP(timeAdd)}\n` +
    `Remove from property: ${moneyGBP(removeAdd)}\n` +
    `Total: ${money(booking.total_pence)}\n`;

  return { subject, html, text };
}
