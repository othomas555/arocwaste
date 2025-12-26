import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import Layout from "../../components/layout";
import appliances from "../../data/appliances";

// ---- helpers ----
function formatDateLabel(d) {
  // e.g. "Mon 12 Jan"
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function toISODate(d) {
  // YYYY-MM-DD
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextWorkingDays(count = 5) {
  const days = [];
  const d = new Date();
  // start from tomorrow
  d.setDate(d.getDate() + 1);

  while (days.length < count) {
    const day = d.getDay(); // 0=Sun, 6=Sat
    if (day !== 0 && day !== 6) {
      days.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function findApplianceById(id) {
  if (!id) return null;

  // Support either:
  // - array of items: [{ id, title/name, price }]
  // - object map: { "upright-fridge-freezer": { ... } }
  if (Array.isArray(appliances)) {
    return appliances.find((x) => x.id === id) || null;
  }

  if (typeof appliances === "object" && appliances !== null) {
    return appliances[id] ? { id, ...appliances[id] } : null;
  }

  return null;
}

function getTitle(item) {
  return item.title || item.name || item.label || item.id;
}

function getPrice(item) {
  // normalize to number
  const p = item.price ?? item.basePrice ?? item.cost;
  const n = Number(p);
  return Number.isFinite(n) ? n : 0;
}

export default function BookAppliancePage() {
  const router = useRouter();
  const { item: itemId } = router.query;

  const item = useMemo(() => findApplianceById(itemId), [itemId]);
  const basePrice = useMemo(() => (item ? getPrice(item) : 0), [item]);
  const title = useMemo(() => (item ? getTitle(item) : ""), [item]);

  const dateOptions = useMemo(() => getNextWorkingDays(5), []);

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

  // default date = first option when ready
  useEffect(() => {
    if (!collectionDateISO && dateOptions.length > 0) {
      setCollectionDateISO(toISODate(dateOptions[0]));
    }
  }, [collectionDateISO, dateOptions]);

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
    return basePrice + timeAddOn + removeAddOn;
  }, [basePrice, timeAddOn, removeAddOn]);

  const canContinue = useMemo(() => {
    // Keep it “light” for now, but prevent empty essentials
    if (!item) return false;
    if (!collectionDateISO) return false;
    if (!fullName.trim()) return false;
    if (!email.trim()) return false;
    if (!phone.trim()) return false;
    if (!postcode.trim()) return false;
    if (!address.trim()) return false;
    return true;
  }, [item, collectionDateISO, fullName, email, phone, postcode, address]);

  function onContinue() {
    if (!item) return;

    const params = new URLSearchParams();
    params.set("item", item.id);
    params.set("title", title);
    params.set("base", String(basePrice));

    params.set("date", collectionDateISO);
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
            <h1 className="text-2xl font-semibold">Appliance not found</h1>
            <p className="mt-2 text-gray-600">
              We couldn’t find that appliance. Please go back and choose an item to book.
            </p>
            <div className="mt-6">
              <Link
                href="/appliances"
                className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-white hover:opacity-90"
              >
                Back to appliances
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <Link href="/appliances" className="text-sm text-gray-600 hover:underline">
                ← Back to appliances
              </Link>
              <h1 className="mt-2 text-3xl font-semibold">Let’s get started</h1>
              <p className="mt-1 text-gray-600">
                Booking for: <span className="font-medium text-gray-900">{title}</span>
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Left: form */}
              <div className="lg:col-span-2 space-y-6">
                {/* Step 1 */}
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold">1) Choose a collection date</h2>
                  <p className="mt-1 text-gray-600">Next 5 working days (excluding weekends)</p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {dateOptions.map((d) => {
                      const iso = toISODate(d);
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
                          <div className="mt-1 text-base font-medium">{formatDateLabel(d)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2 */}
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold">2) Choose a time option</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setTimeOption("any")}
                      className={[
                        "rounded-xl border p-4 text-left transition",
                        timeOption === "any"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 bg-white hover:bg-gray-50",
                      ].join(" ")}
                    >
                      <div className="font-medium">Any time</div>
                      <div className="mt-1 text-sm text-gray-600">£0</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTimeOption("morning")}
                      className={[
                        "rounded-xl border p-4 text-left transition",
                        timeOption === "morning"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 bg-white hover:bg-gray-50",
                      ].join(" ")}
                    >
                      <div className="font-medium">Morning</div>
                      <div className="mt-1 text-sm text-gray-600">+£10</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTimeOption("afternoon")}
                      className={[
                        "rounded-xl border p-4 text-left transition",
                        timeOption === "afternoon"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 bg-white hover:bg-gray-50",
                      ].join(" ")}
                    >
                      <div className="font-medium">Afternoon</div>
                      <div className="mt-1 text-sm text-gray-600">+£10</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTimeOption("twohour")}
                      className={[
                        "rounded-xl border p-4 text-left transition",
                        timeOption === "twohour"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 bg-white hover:bg-gray-50",
                      ].join(" ")}
                    >
                      <div className="font-medium">2-hour slot</div>
                      <div className="mt-1 text-sm text-gray-600">+£25</div>
                    </button>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold">3) Remove from property?</h2>
                  <p className="mt-1 text-gray-600">
                    If the item isn’t outside ready for collection.
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setRemoveFromProperty("no")}
                      className={[
                        "rounded-xl border p-4 text-left transition",
                        removeFromProperty === "no"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 bg-white hover:bg-gray-50",
                      ].join(" ")}
                    >
                      <div className="font-medium">No</div>
                      <div className="mt-1 text-sm text-gray-600">£0</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRemoveFromProperty("yes")}
                      className={[
                        "rounded-xl border p-4 text-left transition",
                        removeFromProperty === "yes"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 bg-white hover:bg-gray-50",
                      ].join(" ")}
                    >
                      <div className="font-medium">Yes</div>
                      <div className="mt-1 text-sm text-gray-600">+£20</div>
                    </button>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold">4) Your details</h2>

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

                    <div>
                      <label className="text-sm font-medium text-gray-700">Postcode</label>
                      <input
                        value={postcode}
                        onChange={(e) => setPostcode(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 uppercase outline-none focus:border-black"
                        placeholder="CFxx xxx"
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
                      By continuing you’re confirming the details are correct (payment not enabled yet).
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
                      <div className="text-gray-700">{title}</div>
                      <div className="font-medium">£{basePrice}</div>
                    </div>

                    <div className="flex items-start justify-between gap-4">
                      <div className="text-gray-700">
                        Time option{" "}
                        <span className="text-gray-500">
                          (
                          {timeOption === "any"
                            ? "Any"
                            : timeOption === "morning"
                            ? "Morning"
                            : timeOption === "afternoon"
                            ? "Afternoon"
                            : "2-hour"}
                          )
                        </span>
                      </div>
                      <div className="font-medium">£{timeAddOn}</div>
                    </div>

                    <div className="flex items-start justify-between gap-4">
                      <div className="text-gray-700">
                        Remove from property{" "}
                        <span className="text-gray-500">({removeFromProperty === "yes" ? "Yes" : "No"})</span>
                      </div>
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
                  </div>

                  <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                    <p className="font-medium text-gray-900">No payment yet</p>
                    <p className="mt-1">
                      This is a placeholder flow so you can see booking → confirmation working end-to-end.
                    </p>
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
