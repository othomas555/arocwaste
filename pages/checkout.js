import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import Layout from "../components/layout";
import { basketGet, basketSubtotal } from "../utils/basket";

// ---- helpers ----
function formatDateLabelFromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function clampQty(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.max(1, Math.min(50, Math.trunc(x)));
}

const DAY_INDEX = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

function nextServiceDatesForDay(dayName, count = 5) {
  const target = DAY_INDEX[String(dayName || "").trim()] || 0;
  if (!target) return [];

  const out = [];
  const now = new Date();

  // JS: Sun=0..Sat=6. Convert to Mon=1..Sun=7
  const todayIdx = ((now.getDay() + 6) % 7) + 1;
  let delta = (target - todayIdx + 7) % 7;

  // Start from next occurrence (including today if same day)
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + delta);

  for (let i = 0; i < count; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${da}`);
    d.setDate(d.getDate() + 7);
  }

  return out;
}

function cleanPostcodeInput(v) {
  return String(v || "").trim().toUpperCase();
}

export default function CheckoutPage() {
  const router = useRouter();

  const [basket, setBasket] = useState([]);
  useEffect(() => {
    setBasket(basketGet());
  }, []);

  const itemsSubtotal = useMemo(() => basketSubtotal(), [basket]);

  // form state
  const [collectionDateISO, setCollectionDateISO] = useState("");
  const [timeOption, setTimeOption] = useState("any"); // any | morning | afternoon | twohour
  const [removeFromProperty, setRemoveFromProperty] = useState("no"); // no | yes

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [postcode, setPostcode] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  // postcode check state
  const [postcodeChecked, setPostcodeChecked] = useState(false);
  const [checkingPostcode, setCheckingPostcode] = useState(false);
  const [postcodeError, setPostcodeError] = useState("");

  // route from authoritative API (/api/route-lookup -> route_areas)
  // Shape we use in this page: { day, area, slot, route_area_id, matched_prefix }
  const [route, setRoute] = useState(null);

  async function checkPostcode() {
    setPostcodeError("");
    setPostcodeChecked(false);
    setRoute(null);
    setCollectionDateISO("");

    const pc = cleanPostcodeInput(postcode);
    if (!pc) {
      setPostcodeError("Enter a postcode.");
      return;
    }

    setCheckingPostcode(true);
    try {
      const res = await fetch(`/api/route-lookup?postcode=${encodeURIComponent(pc)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to check postcode");

      setPostcodeChecked(true);

      if (!json?.in_area || !json?.default) {
        setRoute(null);
        return;
      }

      const def = json.default;

      setRoute({
        day: def.route_day,
        area: def.route_area || "",
        slot: def.slot || "ANY",
        route_area_id: def.route_area_id || null,
        matched_prefix: def.matched_prefix || "",
      });
    } catch (e) {
      setPostcodeError(e?.message || "Failed to check postcode");
      setPostcodeChecked(false);
      setRoute(null);
    } finally {
      setCheckingPostcode(false);
    }
  }

  const allowedDates = useMemo(() => {
    if (!route?.day) return [];
    return nextServiceDatesForDay(route.day, 5);
  }, [route]);

  useEffect(() => {
    if (!route) {
      setCollectionDateISO("");
      return;
    }
    if (!collectionDateISO && allowedDates.length > 0) {
      setCollectionDateISO(allowedDates[0]);
    }
  }, [route, allowedDates, collectionDateISO]);

  const timeAddOn = useMemo(() => {
    if (timeOption === "morning") return 10;
    if (timeOption === "afternoon") return 10;
    if (timeOption === "twohour") return 25;
    return 0;
  }, [timeOption]);

  const removeAddOn = useMemo(() => {
    return removeFromProperty === "yes" ? 20 : 0;
  }, [removeFromProperty]);

  const total = useMemo(() => {
    return itemsSubtotal + timeAddOn + removeAddOn;
  }, [itemsSubtotal, timeAddOn, removeAddOn]);

  const basketOk = useMemo(() => {
    if (!Array.isArray(basket) || basket.length === 0) return false;
    return basket.every((x) => x && x.id && clampQty(x.qty) >= 1);
  }, [basket]);

  const canContinue = useMemo(() => {
    if (!basketOk) return false;

    if (!postcodeChecked) return false;
    if (!route) return false;

    if (!collectionDateISO) return false;
    if (allowedDates.length > 0 && !allowedDates.includes(collectionDateISO)) return false;

    if (!fullName.trim()) return false;
    if (!email.trim()) return false;
    if (!phone.trim()) return false;
    if (!postcode.trim()) return false;
    if (!address.trim()) return false;

    return true;
  }, [
    basketOk,
    postcodeChecked,
    route,
    collectionDateISO,
    allowedDates,
    fullName,
    email,
    phone,
    postcode,
    address,
  ]);

  function onContinue() {
    if (!basketOk) {
      alert("Your basket is empty.");
      return;
    }

    if (!postcodeChecked) {
      alert("Please check your postcode first.");
      return;
    }
    if (!route) {
      alert("Sorry — we don’t cover that postcode yet.");
      return;
    }
    if (!collectionDateISO) {
      alert("Please select a collection date.");
      return;
    }
    if (allowedDates.length > 0 && !allowedDates.includes(collectionDateISO)) {
      alert("Please select one of the available dates.");
      return;
    }

    // Pass basket items into confirm as JSON
    const safeItems = basket.map((x) => ({
      id: x.id,
      category: x.category,
      slug: x.slug,
      title: x.title,
      unitPrice: Number(x.unitPrice) || 0,
      qty: clampQty(x.qty),
    }));

    const params = new URLSearchParams();
    params.set("mode", "basket");
    params.set("items", encodeURIComponent(JSON.stringify(safeItems)));

    params.set("date", collectionDateISO);
    params.set("routeDay", route.day);
    params.set("routeArea", route.area || "");
    params.set("routeSlot", String(route.slot || "ANY").toUpperCase());

    params.set("time", timeOption);
    params.set("timeAdd", String(timeAddOn));

    params.set("remove", removeFromProperty);
    params.set("removeAdd", String(removeAddOn));

    params.set("name", fullName);
    params.set("email", email);
    params.set("phone", phone);
    params.set("postcode", postcode);
    params.set("address", address);
    params.set("notes", notes);

    params.set("itemsSubtotal", String(itemsSubtotal));
    params.set("total", String(total));

    router.push(`/confirm?${params.toString()}`);
  }

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-4 py-10">
        {!basketOk ? (
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold">Your basket is empty</h1>
            <p className="mt-2 text-gray-600">
              Add items first, then return here to checkout.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/furniture"
                className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-white hover:opacity-90"
              >
                Browse furniture
              </Link>
              <Link
                href="/appliances"
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-gray-900 hover:bg-gray-50"
              >
                Browse appliances
              </Link>
              <Link
                href="/basket"
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-gray-900 hover:bg-gray-50"
              >
                View basket
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <Link href="/basket" className="text-sm text-gray-600 hover:underline">
                ← Back to basket
              </Link>
              <h1 className="mt-2 text-3xl font-semibold">Checkout</h1>
              <p className="mt-1 text-gray-600">
                One visit, one booking, one payment — for all items in your basket.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Left: form */}
              <div className="lg:col-span-2 space-y-6">
                {/* 1) Postcode check */}
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold">1) Check your area</h2>
                  <p className="mt-1 text-gray-600">
                    Enter your postcode to see what day we’re in your area.
                  </p>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-700">Postcode</label>
                      <input
                        value={postcode}
                        onChange={(e) => {
                          setPostcode(e.target.value);
                          setPostcodeChecked(false);
                          setRoute(null);
                          setCollectionDateISO("");
                          setPostcodeError("");
                        }}
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 uppercase outline-none focus:border-black"
                        placeholder="e.g. NP20 1AB"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={checkPostcode}
                      disabled={checkingPostcode}
                      className={[
                        "inline-flex items-center justify-center rounded-xl px-5 py-3 text-white",
                        checkingPostcode ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:opacity-90",
                      ].join(" ")}
                    >
                      {checkingPostcode ? "Checking…" : "Check postcode"}
                    </button>
                  </div>

                  {postcodeError ? (
                    <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
                      {postcodeError}
                    </div>
                  ) : null}

                  {postcodeChecked && !route && !postcodeError ? (
                    <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                      Sorry — we don’t cover that postcode yet.
                    </div>
                  ) : null}

                  {postcodeChecked && route ? (
                    <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                      ✅ We cover <span className="font-medium">{route.area || "your area"}</span>. We’re in
                      your area on <span className="font-medium">{route.day}</span>.
                    </div>
                  ) : null}
                </div>

                {/* 2) Date */}
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold">2) Choose a collection date</h2>
                  <p className="mt-1 text-gray-600">
                    {route ? `Next 5 available ${route.day}s` : "Check your postcode first to see available dates."}
                  </p>

                  {!route ? (
                    <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                      Enter and check your postcode above to unlock dates.
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {allowedDates.map((iso) => {
                        const isSelected = collectionDateISO === iso;
                        return (
                          <button
                            key={iso}
                            type="button"
                            onClick={() => setCollectionDateISO(iso)}
                            className={[
                              "rounded-xl border p-4 text-left transition",
                              isSelected ? "border-black bg-gray-50" : "border-gray-200 bg-white hover:bg-gray-50",
                            ].join(" ")}
                          >
                            <div className="text-sm text-gray-500">{iso}</div>
                            <div className="mt-1 text-base font-medium">{formatDateLabelFromISO(iso)}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 3) Time */}
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold">3) Choose a time option</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      { key: "any", label: "Any time", price: "£0" },
                      { key: "morning", label: "Morning", price: "+£10" },
                      { key: "afternoon", label: "Afternoon", price: "+£10" },
                      { key: "twohour", label: "2-hour slot", price: "+£25" },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setTimeOption(opt.key)}
                        className={[
                          "rounded-xl border p-4 text-left transition",
                          timeOption === opt.key ? "border-black bg-gray-50" : "border-gray-200 bg-white hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <div className="font-medium">{opt.label}</div>
                        <div className="mt-1 text-sm text-gray-600">{opt.price}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4) Remove */}
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold">4) Remove from property?</h2>
                  <p className="mt-1 text-gray-600">If items aren’t outside ready for collection.</p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      { key: "no", label: "No", price: "£0" },
                      { key: "yes", label: "Yes", price: "+£20" },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setRemoveFromProperty(opt.key)}
                        className={[
                          "rounded-xl border p-4 text-left transition",
                          removeFromProperty === opt.key ? "border-black bg-gray-50" : "border-gray-200 bg-white hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <div className="font-medium">{opt.label}</div>
                        <div className="mt-1 text-sm text-gray-600">{opt.price}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5) Details */}
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold">5) Your details</h2>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Full name</label>
                      <input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-black"
                        placeholder="Your name"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-black"
                        placeholder="you@example.com"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">Phone</label>
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-black"
                        placeholder="07."
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium text-gray-700">Address</label>
                      <input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-black"
                        placeholder="House number, street, town"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-black"
                        placeholder="Anything we should know? (access, stairs, parking, etc.)"
                        rows={4}
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-gray-600">
                      Continue to confirmation, then pay securely by card.
                    </p>

                    <button
                      type="button"
                      onClick={onContinue}
                      disabled={!canContinue}
                      className={[
                        "inline-flex items-center justify-center rounded-xl px-5 py-3 text-white transition",
                        canContinue ? "bg-black hover:opacity-90" : "bg-gray-300 cursor-not-allowed",
                      ].join(" ")}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: summary */}
              <div className="space-y-6">
                <div className="sticky top-6 rounded-2xl border bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold">Summary</h3>

                  <div className="mt-4 space-y-3 text-sm">
                    {basket.map((it) => (
                      <div key={it.id} className="flex items-start justify-between gap-4">
                        <div className="text-gray-700">
                          {it.title} <span className="text-gray-500">x{clampQty(it.qty)}</span>
                          <div className="text-xs text-gray-500">£{Number(it.unitPrice) || 0} each</div>
                        </div>
                        <div className="font-medium">£{(Number(it.unitPrice) || 0) * clampQty(it.qty)}</div>
                      </div>
                    ))}

                    <div className="border-t pt-3 flex items-start justify-between gap-4">
                      <div className="text-gray-700">Time option</div>
                      <div className="font-medium">£{timeAddOn}</div>
                    </div>

                    <div className="flex items-start justify-between gap-4">
                      <div className="text-gray-700">Remove from property</div>
                      <div className="font-medium">£{removeAddOn}</div>
                    </div>

                    <div className="border-t pt-3 flex items-start justify-between gap-4">
                      <div className="text-gray-900 font-semibold">Total</div>
                      <div className="text-gray-900 font-semibold">£{total}</div>
                    </div>

                    <div className="pt-2 text-gray-600">
                      Collection date: <span className="font-medium text-gray-900">{collectionDateISO || "—"}</span>
                    </div>

                    <div className="pt-1 text-gray-600">
                      Route day:{" "}
                      <span className="font-medium text-gray-900">
                        {postcodeChecked ? (route ? route.day : "Out of area") : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                    <p className="font-medium text-gray-900">Secure card payment</p>
                    <p className="mt-1">You’ll review everything on the confirmation page before paying.</p>
                  </div>

                  <div className="mt-4">
                    <Link
                      href="/basket"
                      className="inline-flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      Edit basket
                    </Link>
                  </div>
                </div>

                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold">Need to add more?</h3>
                  <p className="mt-2 text-sm text-gray-600">You can add more items before paying.</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Link
                      href="/furniture"
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      Add furniture
                    </Link>
                    <Link
                      href="/appliances"
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      Add appliances
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
