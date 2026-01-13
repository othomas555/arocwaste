import { useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../components/layout";

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

function cleanPostcodeInput(s) {
  const raw = String(s || "").trim().toUpperCase();
  const nospace = raw.replace(/\s+/g, "");
  if (!nospace) return "";
  if (!raw.includes(" ") && nospace.length > 3) {
    return `${nospace.slice(0, -3)} ${nospace.slice(-3)}`.trim();
  }
  return raw.replace(/\s+/g, " ").trim();
}

async function readJsonOrText(res) {
  const ct = String(res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();
  if (ct.includes("application/json")) {
    try {
      return { ok: true, json: JSON.parse(text), raw: text };
    } catch {
      return { ok: false, json: null, raw: text };
    }
  }
  try {
    return { ok: true, json: JSON.parse(text), raw: text };
  } catch {
    return { ok: false, json: null, raw: text };
  }
}

function waLink(numberUK, message) {
  // Convert "07395 109055" -> "447395109055"
  const digits = String(numberUK || "").replace(/[^\d]/g, "");
  let e164 = digits;
  if (e164.startsWith("0")) e164 = "44" + e164.slice(1);
  if (!e164.startsWith("44")) e164 = "44" + e164; // last resort
  const base = `https://wa.me/${e164}`;
  const text = String(message || "").trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export default function ManVanPage() {
  // WhatsApp number you gave
  const WHATSAPP_NUMBER = "07395 109055";

  const [postcode, setPostcode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [house, setHouse] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [town, setTown] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null);

  const whatsappMsg = useMemo(() => {
    const pc = cleanPostcodeInput(postcode);
    return [
      "Hi AROC Waste 👋",
      "",
      "Please can you quote from photos?",
      "",
      pc ? `Postcode: ${pc}` : "Postcode:",
      house ? `House/No: ${house}` : "House/No:",
      addressLine1 ? `Street: ${addressLine1}` : "Street:",
      town ? `Town: ${town}` : "Town:",
      "",
      "Photos:",
      "1) Wide shot of items",
      "2) Close-ups / quantity",
      "3) Access route (stairs / narrow lane etc.)",
      "",
      notes ? `Notes: ${notes}` : "Notes:",
    ].join("\n");
  }, [postcode, house, addressLine1, town, notes]);

  async function submitVisitRequest(e) {
    e.preventDefault();
    setError("");
    setConfirm(null);

    const pc = cleanPostcodeInput(postcode);
    if (!pc) return setError("Please enter your postcode.");
    if (!name.trim()) return setError("Please enter your name.");
    if (!phone.trim()) return setError("Please enter your phone number.");
    if (!house.trim()) return setError("Please enter your house number / name.");
    if (!addressLine1.trim()) return setError("Please enter your street / address line.");
    if (!town.trim()) return setError("Please enter your town.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/man-van/request-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode: pc,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          house: house.trim(),
          address_line1: addressLine1.trim(),
          town: town.trim(),
          notes: notes.trim(),
        }),
      });

      const parsed = await readJsonOrText(res);
      if (!res.ok) {
        const msg = parsed?.json?.error || `Request failed (${res.status})`;
        throw new Error(msg);
      }

      setConfirm(parsed.json || { ok: true });
    } catch (err) {
      setError(err?.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="bg-[#f7f9ff]">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Man &amp; Van collections</h1>
                <p className="mt-3 max-w-2xl text-slate-600">
                  For larger / unusual collections where we need to see it first. Request a quote visit, or send photos on
                  WhatsApp for a quick estimate.
                </p>
              </div>

              <div className="mt-4 sm:mt-0 flex gap-2">
                <Link
                  href="/furniture"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:border-slate-300"
                >
                  Book Furniture
                </Link>
                <Link
                  href="/appliances"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:border-slate-300"
                >
                  Book Appliances
                </Link>
              </div>
            </div>

            {error ? (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
            ) : null}

            {confirm?.ok ? (
              <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
                <div className="text-lg font-semibold text-emerald-900">Request received ✅</div>
                <div className="mt-2 text-sm text-emerald-900">
                  We’ve booked a quote visit appointment for:
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-emerald-200">
                    <div className="text-xs font-semibold text-slate-600">Area</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{confirm.route_area || "—"}</div>
                  </div>
                  <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-emerald-200">
                    <div className="text-xs font-semibold text-slate-600">Day</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{confirm.route_day || "—"}</div>
                  </div>
                  <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-emerald-200">
                    <div className="text-xs font-semibold text-slate-600">Appointment date</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{confirm.appointment_date || "—"}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      Slot: <span className="font-semibold">{String(confirm.route_slot || "ANY").toUpperCase()}</span>
                    </div>
                  </div>
                </div>

                {confirm.job_id ? (
                  <div className="mt-3 text-xs text-emerald-900">
                    Reference: <span className="font-mono font-semibold">{confirm.job_id}</span>
                  </div>
                ) : null}

                <div className="mt-5 flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/"
                    className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-black"
                  >
                    Back to homepage
                  </Link>

                  <a
                    href={waLink(WHATSAPP_NUMBER, whatsappMsg)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold hover:border-slate-300"
                  >
                    Send photos on WhatsApp
                  </a>
                </div>
              </div>
            ) : (
              <div className="mt-8 grid gap-6 lg:grid-cols-2">
                {/* VISIT REQUEST FORM */}
                <div className="rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-200">
                  <div className="text-base font-semibold text-slate-900">Request a quote visit</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Enter your postcode and details. We’ll assign the next available appointment day for your area.
                  </div>

                  <form onSubmit={submitVisitRequest} className="mt-5 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Postcode</label>
                      <input
                        value={postcode}
                        onChange={(e) => setPostcode(e.target.value)}
                        placeholder="e.g. CF32 0AA"
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Name</label>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Your name"
                          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Phone</label>
                        <input
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="Mobile number"
                          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Email (optional)</label>
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">House no / name</label>
                        <input
                          value={house}
                          onChange={(e) => setHouse(e.target.value)}
                          placeholder="e.g. 12"
                          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Town</label>
                        <input
                          value={town}
                          onChange={(e) => setTown(e.target.value)}
                          placeholder="e.g. Bridgend"
                          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Street / address line</label>
                      <input
                        value={addressLine1}
                        onChange={(e) => setAddressLine1(e.target.value)}
                        placeholder="e.g. High Street"
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Notes (optional)</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="What needs removing? Any access issues (stairs / narrow lane / parking)?"
                        rows={4}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className={cx(
                        "w-full inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-semibold",
                        submitting ? "bg-slate-300 text-slate-600" : "bg-indigo-600 text-white hover:opacity-90"
                      )}
                    >
                      {submitting ? "Submitting…" : "Confirm quote visit appointment"}
                    </button>

                    <div className="text-xs text-slate-500">
                      We’ll add this as a job for the office team. If we can quote from photos, use WhatsApp below instead.
                    </div>
                  </form>
                </div>

                {/* WHATSAPP OPTION */}
                <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                  <div className="text-base font-semibold text-slate-900">Don’t need a visit? Send photos on WhatsApp</div>
                  <div className="mt-1 text-sm text-slate-600">
                    For straightforward jobs we can often quote from photos and book you in without a site visit.
                  </div>

                  <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">Please send:</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      <li>Postcode + house number</li>
                      <li>2–4 clear photos of the items</li>
                      <li>Any access info (stairs, distance to van, parking)</li>
                      <li>Anything heavy / unusual</li>
                    </ul>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <a
                      href={waLink(WHATSAPP_NUMBER, whatsappMsg)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      WhatsApp photos
                    </a>

                    <a
                      href="tel:01656470040"
                      className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold hover:border-slate-300"
                    >
                      Call 01656 470040
                    </a>
                  </div>

                  <div className="mt-6 text-xs text-slate-500">
                    If we decide a visit is needed, we’ll book you into the next available appointment for your area.
                  </div>
                </div>
              </div>
            )}

            <div className="mt-10 rounded-2xl bg-slate-50 p-5 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Tip</p>
              <p className="mt-1">
                If it’s a normal appliance or furniture item, it’s usually quicker to book directly:
                <span className="ml-2">
                  <Link href="/appliances" className="font-semibold text-indigo-600 hover:underline">
                    Appliances
                  </Link>
                </span>
                <span className="mx-2 text-slate-300">•</span>
                <Link href="/furniture" className="font-semibold text-indigo-600 hover:underline">
                  Furniture
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
