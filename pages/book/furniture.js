import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import Layout from "../../components/layout";
import { furnitureItems } from "../../data/furniture";
import { findRouteForPostcode, nextServiceDatesForDay } from "../../utils/postcode";

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

function findFurnitureById(id) {
  if (!id) return null;
  const items = Array.isArray(furnitureItems) ? furnitureItems : [];
  return items.find((x) => x.id === id) || null;
}

function clampQty(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.max(1, Math.min(20, Math.trunc(x)));
}

export default function BookFurniturePage() {
  const router = useRouter();
  const { item: itemId } = router.query;

  const item = useMemo(() => findFurnitureById(itemId), [itemId]);

  const basePrice = useMemo(() => {
    const n = Number(item?.price ?? 0);
    return Number.isFinite(n) ? n : 0;
  }, [item]);

  // form state
  const [collectionDateISO, setCollectionDateISO] = useState("");

  // ✅ quantity
  const [qty, setQty] = useState(1);

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

  const route = useMemo(() => {
    if (!postcodeChecked) return null;
    return findRouteForPostcode(postcode);
  }, [postcode, postcodeChecked]);

  const allowedDates = useMemo(() => {
    if (!route) return [];
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

  const itemsSubtotal = useMemo(() => {
    return basePrice * clampQty(qty);
  }, [basePrice, qty]);

  const total = useMemo(() => {
    return itemsSubtotal + timeAddOn + removeAddOn;
  }, [itemsSubtotal, timeAddOn, removeAddOn]);

  const canContinue = useMemo(() => {
    if (!item) return false;
    if (!postcodeChecked) return false;
    if (!route) return false;

    if (!collectionDateISO) return false;
    if (allowedDates.length > 0 && !allowedDates.includes(collectionDateISO)) return false;

    if (!fullName.trim()) return false;
    if (!email.trim()) return false;
    if (!phone.trim()) return false;
    if (!postcode.trim()) return false;
    if (!address.trim()) return false;

    // qty sanity
    if (!Number.isFinite(Number(qty)) || clampQty(qty) < 1) return false;

    return true;
  }, [
    item,
    postcodeChecked,
    route,
    collectionDateISO,
    allowedDates,
    fullName,
    email,
    phone,
    postcode,
    address,
    qty,
  ]);

  function onContinue() {
    if (!item) return;

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

    const safeQty = clampQty(qty);

    const params = new URLSearchParams();
    params.set("item", item.id);
    params.set("title", item.title);
    params.set("base", String(basePrice));
    params.set("qty", String(safeQty));

    params.set("date", collectionDateISO);
    params.set("routeDay", route.day);
    params.set("routeArea", route.area || "");

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

    params.set("total", String(total));

    router.push(`/confirm?${params.toString()}`);
  }

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-4 py-10">
        {!item ? (
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold">Furniture item not found</h1>
            <p className="mt-2 text-gray-600">
              We couldn’t find that item. Please go back and choose an item to book.
            </p>
            <div className="mt-6">
              <Link
                href="/furniture"
                className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-white hover:opacity-90"
              >
                Back to furniture
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <Link href="/furniture" className="text-sm text-gray-600 hover:underline">
                ← Back to furniture
              </Link>
              <h1 className="mt-2 text-3xl font-semibold">Let’s get started</h1>
              <p className="mt-1 text-gray-600">
                Booking for: <span className="font-medium text-gray-900">{item.title}</span>
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
                          setCollectionDateISO("");
                        }}
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 uppercase outline-none focus:border-black"
                        placeholder="e.g. NP20 1AB"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setPostcodeChecked(true)}
                      className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-white hover:opacity-90"
                    >
                      Check postcode
                    </button>
                  </div>

                  {postcodeChecked && !route && (
                    <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                      Sorry — we don’t cover that postcode yet.
                    </div>
                  )}

                  {postcodeChecked && route && (
                    <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                      ✅ We cover <span className="font-medium">{route.area || "your area"}</span>. We’re in
                      your area on <span className="font-medium">{route.day}</span>.
                    </div>
                  )}
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
                              isSelected
                                ? "border-black bg-gray-50"
                                : "border-gray-200 bg-white hover:bg-gray-50",
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

                {/* ✅ 3) Quantity */}
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold">3) Quantity</h2>
                  <p className="mt-1 text-gray-600">
                    How many of this item do you need collecting?
                  </p>

                  <div className="mt-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm text-gray-500">Price per item</div>
                      <div className="text-lg font-semibold">£{basePrice}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQty((q) => clampQty(Number(q) - 1))}
                        className="h-10 w-10 rounded-xl border bg-white text-lg"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>

                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={qty}
                        onChange={(e) => setQty(clampQty(e.target.value))}
                        className="h-10 w-16 rounded-xl border text-center font-semibold"
                      />

                      <button
                        type="button"
                        onClick={() => setQty((q) => clampQty(Number(q) + 1))}
                        className="h-10 w-10 rounded-xl border bg-white text-lg"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-gray-600">Items subtotal</span>
                    <span className="font-semibold">£{itemsSubtotal}</span>
                  </div>
                </div>

                {/* 4) Time */}
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold">4) Choose a time option</h2>
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
                          timeOption === opt.key
                            ? "border-black bg-gray-50"
                            : "border-gray-200 bg-white hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <div className="font-medium">{opt.label}</div>
                        <div className="mt-1 text-sm text-gray-600">{opt.price}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5) Remove */}
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold">5) Remove from property?</h2>
                  <p className="mt-1 text-gray-600">If the item isn’t outside ready for collection.</p>

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
                          removeFromProperty === opt.key
                            ? "border-black bg-gray-50"
                            : "border-gray-200 bg-white hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <div className="font-medium">{opt.label}</div>
                        <div className="mt-1 text-sm text-gray-600">{opt.price}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 6) Details */}
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold">6) Your details</h2>

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
                        placeholder="07..."
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
                    <div className="flex items-start justify-between gap-4">
                      <div className="text-gray-700">
                        {item.title} <span className="text-gray-500">x{clampQty(qty)}</span>
                        <div className="text-xs text-gray-500">£{basePrice} each</div>
                      </div>
                      <div className="font-medium">£{itemsSubtotal}</div>
                    </div>

                    <div className="flex items-start justify-between gap-4">
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
                      Collection date:{" "}
                      <span className="font-medium text-gray-900">{collectionDateISO || "—"}</span>
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
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
