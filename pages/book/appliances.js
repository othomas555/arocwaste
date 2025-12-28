// pages/book/appliances.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/layout";
import { appliances, getApplianceBySlug } from "../../data/appliances";

/**
 * NOTE:
 * This page is built to match the Furniture booking flow pattern:
 * - item from query string (?item=slug)
 * - postcode -> route/day -> limited available dates
 * - time add-ons
 * - remove-from-property add-on
 * - qty selector + running total
 * - Continue -> /confirm with full details in query params
 *
 * If your /confirm page is currently furniture-only, tell me and I’ll paste a full updated /confirm file
 * that supports both furniture and appliances.
 */

function formatGBP(amount) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
  }).format(amount);
}

function normalizePostcode(raw) {
  return (raw || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isValidPostcodeBasic(pc) {
  // Not perfect validation; keeps UX friendly and avoids blocking legit inputs.
  // Your Furniture flow likely has its own validation—swap this if needed.
  return pc.length >= 5 && pc.length <= 8 && /[A-Z]/.test(pc) && /\d/.test(pc);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISODate(date) {
  // yyyy-mm-dd
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function humanDate(iso) {
  // e.g. Tue 14 Jan
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function dayOfWeekName(dateObj) {
  return dateObj.toLocaleDateString("en-GB", { weekday: "long" });
}

/**
 * Route/day logic (EDIT THIS to match your Furniture rules)
 * We map postcode outward code prefix to a collection weekday.
 *
 * Example: CF32/CF33/CF34 etc. If not matched, default to "Thursday".
 */
const ROUTE_RULES = [
  // Bridgend / Porthcawl / nearby examples
  { prefixes: ["CF32"], day: 2 }, // Tue
  { prefixes: ["CF33"], day: 3 }, // Wed
  { prefixes: ["CF34"], day: 4 }, // Thu
  { prefixes: ["CF35"], day: 5 }, // Fri
  { prefixes: ["CF36"], day: 2 }, // Tue
  { prefixes: ["CF31"], day: 3 }, // Wed
  // Cardiff-ish examples (tune/remove as needed)
  { prefixes: ["CF10", "CF11", "CF14", "CF15", "CF23", "CF24"], day: 4 }, // Thu
];

function getRouteDayFromPostcode(postcode) {
  const pc = normalizePostcode(postcode);
  const outward = pc.split(" ")[0]; // e.g. CF33
  const match = ROUTE_RULES.find((r) => r.prefixes.includes(outward));
  // JS getDay(): Sun 0..Sat 6
  // We'll store day as 1..5 = Mon..Fri for simplicity.
  return match ? match.day : 4; // default Thu (4)
}

function isWeekend(dateObj) {
  const day = dateObj.getDay();
  return day === 0 || day === 6;
}

function nextDatesForRoute(routeDayMonFri, count = 5, horizonDays = 28) {
  // routeDayMonFri: Mon=1 ... Fri=5
  // Return next `count` dates within horizon matching that weekday.
  const today = new Date();
  const results = [];
  for (let i = 0; i <= horizonDays && results.length < count; i++) {
    const d = addDays(today, i);
    if (isWeekend(d)) continue;

    const jsDay = d.getDay(); // Mon=1..Fri=5
    if (jsDay === routeDayMonFri) {
      results.push(toISODate(d));
    }
  }
  return results;
}

const TIME_OPTIONS = [
  { id: "any", label: "Any time", price: 0, note: "We’ll arrive at any time during the day." },
  { id: "morning", label: "Morning", price: 10, note: "Arrive 8am–12pm." },
  { id: "afternoon", label: "Afternoon", price: 10, note: "Arrive 12pm–5pm." },
  { id: "twohour", label: "2-hour slot", price: 25, note: "We’ll contact you to confirm a 2-hour window." },
];

const REMOVE_FROM_PROPERTY_ADDON = {
  id: "remove_from_property",
  label: "Remove from property",
  price: 20,
  note: "We’ll collect from inside the property (ground floor).",
};

export default function BookAppliancesPage() {
  const router = useRouter();
  const { item: itemSlug } = router.query;

  const item = useMemo(() => {
    if (!itemSlug || typeof itemSlug !== "string") return null;
    return getApplianceBySlug(itemSlug);
  }, [itemSlug]);

  // If no item provided, we allow the user to choose on this page
  const [selectedSlug, setSelectedSlug] = useState("");
  useEffect(() => {
    if (item?.slug) setSelectedSlug(item.slug);
  }, [item?.slug]);

  const selectedItem = useMemo(() => {
    const slug = selectedSlug || (typeof itemSlug === "string" ? itemSlug : "");
    return slug ? getApplianceBySlug(slug) : null;
  }, [selectedSlug, itemSlug]);

  const [postcode, setPostcode] = useState("");
  const [postcodeTouched, setPostcodeTouched] = useState(false);

  const normalizedPostcode = useMemo(() => normalizePostcode(postcode), [postcode]);
  const postcodeOk = useMemo(
    () => isValidPostcodeBasic(normalizedPostcode),
    [normalizedPostcode]
  );

  const routeDay = useMemo(() => {
    if (!postcodeOk) return null;
    return getRouteDayFromPostcode(normalizedPostcode);
  }, [postcodeOk, normalizedPostcode]);

  const availableDates = useMemo(() => {
    if (!routeDay) return [];
    return nextDatesForRoute(routeDay, 5, 35);
  }, [routeDay]);

  const [dateISO, setDateISO] = useState("");
  useEffect(() => {
    // auto-set first available date once we have available dates
    if (!dateISO && availableDates.length > 0) setDateISO(availableDates[0]);
  }, [availableDates, dateISO]);

  const [timeOptionId, setTimeOptionId] = useState("any");
  const timeOption = useMemo(
    () => TIME_OPTIONS.find((t) => t.id === timeOptionId) || TIME_OPTIONS[0],
    [timeOptionId]
  );

  const [removeFromProperty, setRemoveFromProperty] = useState(false);

  const [qty, setQty] = useState(1);
  useEffect(() => {
    if (qty < 1) setQty(1);
    if (qty > 20) setQty(20);
  }, [qty]);

  // Customer details (same as Furniture pattern)
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const baseTotal = useMemo(() => {
    if (!selectedItem) return 0;
    return selectedItem.price * qty;
  }, [selectedItem, qty]);

  const addonsTotal = useMemo(() => {
    const time = timeOption?.price || 0;
    const remove = removeFromProperty ? REMOVE_FROM_PROPERTY_ADDON.price : 0;
    return time + remove;
  }, [timeOption, removeFromProperty]);

  const total = useMemo(() => baseTotal + addonsTotal, [baseTotal, addonsTotal]);

  const canContinue = useMemo(() => {
    return (
      !!selectedItem &&
      postcodeOk &&
      !!dateISO &&
      !!name.trim() &&
      !!email.trim() &&
      !!phone.trim() &&
      !!address.trim() &&
      qty >= 1
    );
  }, [selectedItem, postcodeOk, dateISO, name, email, phone, address, qty]);

  function handleContinue() {
    if (!canContinue) return;

    // Build add-ons list (for confirm page + later Stripe/Supabase usage)
    const addons = [];
    if (timeOption && timeOption.price > 0) {
      addons.push({ id: `time_${timeOption.id}`, label: timeOption.label, price: timeOption.price });
    }
    if (removeFromProperty) {
      addons.push({
        id: REMOVE_FROM_PROPERTY_ADDON.id,
        label: REMOVE_FROM_PROPERTY_ADDON.label,
        price: REMOVE_FROM_PROPERTY_ADDON.price,
      });
    }

    // Pass everything through query params (same style as your Furniture flow likely does)
    const query = {
      category: "appliances",
      item: selectedItem.slug,
      title: selectedItem.title,
      basePrice: String(selectedItem.price),
      qty: String(qty),
      postcode: normalizedPostcode,
      routeDay: String(routeDay || ""),
      date: dateISO,
      time: timeOption.id,
      timeLabel: timeOption.label,
      timePrice: String(timeOption.price || 0),
      remove: removeFromProperty ? "1" : "0",
      removePrice: String(removeFromProperty ? REMOVE_FROM_PROPERTY_ADDON.price : 0),
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      notes: notes.trim(),
      addons: encodeURIComponent(JSON.stringify(addons)),
      total: String(total),
    };

    router.push({ pathname: "/confirm", query });
  }

  return (
    <Layout
      title="Book Appliance Collection | AROC Waste"
      description="Choose your appliance item, confirm your date, add extras, and pay securely."
    >
      <div className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
          {/* Header */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
              <Link href="/appliances" className="text-slate-600 hover:text-slate-900">
                Appliances
              </Link>
              <span className="text-slate-300">•</span>
              <span>Booking</span>
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Let’s get your appliance collected.
            </h1>
            <p className="mt-2 text-slate-600">
              Choose the item, confirm your collection day for your postcode, then pay securely online.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left: form */}
            <div className="lg:col-span-7">
              {/* Item picker */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">1) Choose item</div>
                <p className="mt-1 text-sm text-slate-600">
                  Pick the closest match — you can add details in notes.
                </p>

                <div className="mt-4">
                  <label className="block text-xs font-medium text-slate-700">
                    Appliance item
                  </label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                    value={selectedSlug}
                    onChange={(e) => setSelectedSlug(e.target.value)}
                  >
                    <option value="">Select an item…</option>
                    {appliances.map((a) => (
                      <option key={a.slug} value={a.slug}>
                        {a.title} — {formatGBP(a.price)}
                      </option>
                    ))}
                  </select>

                  {selectedItem && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <div className="font-semibold text-slate-900">{selectedItem.title}</div>
                      <div className="text-slate-600">{selectedItem.subtitle}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Postcode + date */}
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">2) Postcode & collection date</div>
                <p className="mt-1 text-sm text-slate-600">
                  We’ll show the next available collection dates for your area.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Postcode</label>
                    <input
                      value={postcode}
                      onChange={(e) => setPostcode(e.target.value)}
                      onBlur={() => setPostcodeTouched(true)}
                      placeholder="e.g. CF33 4AA"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                    />
                    {postcodeTouched && !postcodeOk && (
                      <p className="mt-2 text-xs text-rose-600">
                        Please enter a valid postcode.
                      </p>
                    )}
                    {postcodeOk && routeDay && (
                      <p className="mt-2 text-xs text-slate-500">
                        Your collection day is <span className="font-semibold text-slate-700">{dayOfWeekName(
                          new Date(availableDates[0] + "T00:00:00")
                        )}</span>.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700">Collection date</label>
                    <select
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                      value={dateISO}
                      onChange={(e) => setDateISO(e.target.value)}
                      disabled={!postcodeOk || availableDates.length === 0}
                    >
                      {availableDates.length === 0 ? (
                        <option value="">Enter postcode to see dates</option>
                      ) : (
                        availableDates.map((d) => (
                          <option key={d} value={d}>
                            {humanDate(d)}
                          </option>
                        ))
                      )}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      We offer the next 5 available dates for your route.
                    </p>
                  </div>
                </div>
              </div>

              {/* Add-ons */}
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">3) Options</div>
                <p className="mt-1 text-sm text-slate-600">
                  Add timed arrival or removal-from-property if needed.
                </p>

                <div className="mt-4">
                  <div className="text-xs font-medium text-slate-700">Time option</div>
                  <div className="mt-2 grid gap-3">
                    {TIME_OPTIONS.map((t) => (
                      <label
                        key={t.id}
                        className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300"
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="timeOption"
                            value={t.id}
                            checked={timeOptionId === t.id}
                            onChange={() => setTimeOptionId(t.id)}
                            className="mt-1"
                          />
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {t.label}{" "}
                              {t.price > 0 && (
                                <span className="ml-2 text-sm font-semibold text-slate-700">
                                  +{formatGBP(t.price)}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-600">{t.note}</div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="mt-5">
                  <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={removeFromProperty}
                        onChange={(e) => setRemoveFromProperty(e.target.checked)}
                        className="mt-1"
                      />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {REMOVE_FROM_PROPERTY_ADDON.label}{" "}
                          <span className="ml-2 text-sm font-semibold text-slate-700">
                            +{formatGBP(REMOVE_FROM_PROPERTY_ADDON.price)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-600">
                          {REMOVE_FROM_PROPERTY_ADDON.note}
                        </div>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Quantity */}
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">4) Quantity</div>
                <p className="mt-1 text-sm text-slate-600">
                  Increase quantity for multiple items of the same type.
                </p>

                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={qty}
                    onChange={(e) => setQty(Number(e.target.value || 1))}
                    className="h-10 w-20 rounded-xl border border-slate-200 bg-white px-3 text-center text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50"
                    onClick={() => setQty((q) => Math.min(20, q + 1))}
                  >
                    +
                  </button>

                  <div className="text-sm text-slate-600">
                    {selectedItem ? (
                      <>
                        {formatGBP(selectedItem.price)} per item
                      </>
                    ) : (
                      <>Select an item to see price</>
                    )}
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">5) Your details</div>
                <p className="mt-1 text-sm text-slate-600">
                  Used for confirmation and driver instructions.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Name</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Phone</label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Postcode</label>
                    <input
                      value={normalizedPostcode}
                      readOnly
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-medium text-slate-700">Address</label>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="House number + street + town"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                  />
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-medium text-slate-700">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    placeholder="Access notes, stairs, parking instructions, etc."
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Continue */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={!canContinue}
                  className={`inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold shadow-sm transition ${
                    canContinue
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "bg-slate-200 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  Continue →
                </button>

                <Link
                  href="/appliances"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
                >
                  Back to appliances
                </Link>

                {!canContinue && (
                  <p className="text-xs text-slate-500">
                    Complete item, postcode/date, quantity and contact details to continue.
                  </p>
                )}
              </div>
            </div>

            {/* Right: summary */}
            <div className="lg:col-span-5">
              <div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">Booking summary</div>

                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-slate-600">Item</div>
                    <div className="text-right font-semibold text-slate-900">
                      {selectedItem ? selectedItem.title : "Select an item"}
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div className="text-slate-600">Quantity</div>
                    <div className="text-right font-semibold text-slate-900">{qty}</div>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div className="text-slate-600">Base</div>
                    <div className="text-right font-semibold text-slate-900">
                      {formatGBP(baseTotal)}
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Add-ons
                    </div>

                    <div className="mt-2 space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="text-slate-600">{timeOption.label}</div>
                        <div className="font-semibold text-slate-900">
                          {timeOption.price > 0 ? `+${formatGBP(timeOption.price)}` : formatGBP(0)}
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-4">
                        <div className="text-slate-600">Remove from property</div>
                        <div className="font-semibold text-slate-900">
                          {removeFromProperty
                            ? `+${formatGBP(REMOVE_FROM_PROPERTY_ADDON.price)}`
                            : formatGBP(0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="text-slate-700 font-semibold">Total</div>
                      <div className="text-right text-lg font-semibold text-slate-900">
                        {formatGBP(total)}
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Secure card payment at checkout.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    {postcodeOk && availableDates.length > 0 ? (
                      <>
                        Route day:{" "}
                        <span className="font-semibold text-slate-700">
                          {dayOfWeekName(new Date(availableDates[0] + "T00:00:00"))}
                        </span>{" "}
                        • Selected date:{" "}
                        <span className="font-semibold text-slate-700">
                          {dateISO ? humanDate(dateISO) : "—"}
                        </span>
                      </>
                    ) : (
                      <>Enter your postcode to see available dates.</>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Small footer note */}
          <div className="mt-10 text-xs text-slate-500">
            Items must be ready for collection. If an item is exceptionally heavy or access is difficult,
            please add details in notes.
          </div>
        </div>
      </div>
    </Layout>
  );
}
