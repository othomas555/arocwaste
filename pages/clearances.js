// pages/clearances.js
import { useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../components/layout";

function normalizePostcode(pc) {
  return String(pc || "").trim().toUpperCase().replace(/\s+/g, " ").trim();
}

async function lookupRoute(postcode) {
  const pc = normalizePostcode(postcode);
  if (!pc) return null;

  const res = await fetch(`/api/route-lookup?postcode=${encodeURIComponent(pc)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json?.error || "Route lookup failed" };
  return json;
}

function formatYMDToUK(ymd) {
  if (!ymd || typeof ymd !== "string") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/London",
    }).format(d);
  } catch {
    return ymd;
  }
}

export default function ClearancesPage() {
  const [postcode, setPostcode] = useState("");
  const [checked, setChecked] = useState(false);

  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeResult, setRouteResult] = useState(null);
  const [routeError, setRouteError] = useState("");

  const route = useMemo(() => {
    if (!checked) return null;
    // Keep the same shape the old code expected: { day, area, slot?, next_date? }
    const def = routeResult?.default;
    if (!def) return null;
    return {
      day: def.route_day,
      area: def.route_area,
      slot: def.slot || "ANY",
      next_date: def.next_date || null,
    };
  }, [checked, routeResult]);

  const covered = checked && !loadingRoute && !!route;
  const notCovered = checked && !loadingRoute && !route && !routeError;
  const hasError = checked && !loadingRoute && !!routeError;

  const mailto = useMemo(() => {
    // You can change this to your preferred quote inbox
    const to = "hello@arocwaste.co.uk";
    const subject = encodeURIComponent("Clearance quote request");
    const body = encodeURIComponent(
      `Hi AROC Waste,\n\nI'd like a quote for a clearance.\n\nPostcode: ${postcode || ""}\nType: (house / shed / garden / other)\nAccess notes:\nPreferred dates:\n\nThanks,\n`
    );
    return `mailto:${to}?subject=${subject}&body=${body}`;
  }, [postcode]);

  async function onCheckArea() {
    setChecked(true);
    setRouteError("");
    setRouteResult(null);

    const pc = normalizePostcode(postcode);
    if (!pc) {
      setRouteError("Enter a postcode");
      return;
    }

    setLoadingRoute(true);
    try {
      const out = await lookupRoute(pc);
      if (!out) {
        setRouteError("Route lookup failed");
      } else if (out.error) {
        setRouteError(out.error);
      } else {
        setRouteResult(out);
      }
    } catch (e) {
      setRouteError("Route lookup failed");
    } finally {
      setLoadingRoute(false);
    }
  }

  const coverageDateText = useMemo(() => {
    if (!route) return "";
    const next = route.next_date ? formatYMDToUK(route.next_date) : "";
    if (next) return next;
    // Fallback if next_date missing
    return route.day || "";
  }, [route]);

  return (
    <Layout
      title="House, Shed & Garden Clearances | AROC Waste"
      description="We provide house clearances, shed clearances and garden waste clearances. We assess, quote, agree a date, clear efficiently and dispose responsibly."
    >
      <div className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
          {/* Header / Hero */}
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
              <span className="text-slate-400">AROC Waste</span>
              <span className="text-slate-300">•</span>
              <span>Clearances</span>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-12 lg:items-start">
              <div className="lg:col-span-7">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  House, shed &amp; garden clearances — done properly.
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                  If you’ve got a full property to clear, bulky rubbish in a shed, or a garden
                  that needs stripping back — we’ll assess the job, provide a clear quote, agree a
                  date, then clear it efficiently and dispose of everything responsibly.
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <a
                    href="#quote"
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  >
                    Get a quote
                  </a>
                  <Link
                    href="/contact"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
                  >
                    Contact us →
                  </Link>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  {[
                    "House clearances",
                    "Shed & garage clearances",
                    "Garden waste removal",
                    "Responsible disposal",
                  ].map((chip) => (
                    <span
                      key={chip}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">How it works</div>
                  <ol className="mt-3 space-y-2 text-sm text-slate-700">
                    <li>
                      <span className="font-semibold">1)</span> Check we cover your postcode
                    </li>
                    <li>
                      <span className="font-semibold">2)</span> We arrange a quick assessment (or photos)
                    </li>
                    <li>
                      <span className="font-semibold">3)</span> You get a clear quote (no surprises)
                    </li>
                    <li>
                      <span className="font-semibold">4)</span> Agree a date — we arrive and clear it
                    </li>
                    <li>
                      <span className="font-semibold">5)</span> Waste handled responsibly
                    </li>
                  </ol>

                  <a
                    href="#quote"
                    className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  >
                    Check postcode & request quote
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Services band */}
          <div className="-mx-4 border-t border-slate-200 bg-slate-50 px-4 py-10 sm:py-12">
            <div className="mx-auto max-w-6xl">
              <h2 className="text-xl font-semibold text-slate-900">Clearance services</h2>
              <p className="mt-1 text-sm text-slate-600">
                Choose the type of clearance — we’ll quote based on volume, access and labour required.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card
                  title="House clearances"
                  text="Full or partial clearances for homes, rentals, probate, downsizing, or end-of-tenancy."
                  bullets={["Assessment + quote", "Agreed collection date", "Responsible disposal"]}
                />
                <Card
                  title="Shed & garage clearances"
                  text="Old tools, boxes, bulky items, broken furniture, general rubbish — cleared fast."
                  bullets={["Tight access friendly", "Labour included", "Clean finish"]}
                />
                <Card
                  title="Garden clearances"
                  text="Green waste, old fencing, timber, general garden debris — loaded and removed."
                  bullets={["Bagged/loaded", "Recycling where possible", "Licensed disposal routes"]}
                />
              </div>

              <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">What affects the price?</h3>
                <div className="mt-3 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="font-semibold text-slate-900">Volume</div>
                    <div className="mt-1 text-slate-600">
                      How much needs removing (roughly van-load / multiple loads).
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="font-semibold text-slate-900">Access</div>
                    <div className="mt-1 text-slate-600">
                      Distance to load point, stairs, parking, narrow paths, etc.
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="font-semibold text-slate-900">Labour</div>
                    <div className="mt-1 text-slate-600">
                      Heavy/bulky items, dismantling, bagging, clearing and tidying.
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="font-semibold text-slate-900">Waste type</div>
                    <div className="mt-1 text-slate-600">
                      Some items require specialist handling or extra disposal costs.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quote section */}
          <div id="quote" className="mt-10">
            <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
              <div className="lg:col-span-7">
                <h2 className="text-2xl font-semibold text-slate-900">Get a clearance quote</h2>
                <p className="mt-2 text-slate-600">
                  Start by checking your postcode. If we cover your area, request a quote and we’ll
                  arrange an assessment (or you can send photos).
                </p>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="text-sm font-semibold text-slate-900">1) Check your postcode</div>

                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-slate-700">Postcode</label>
                      <input
                        value={postcode}
                        onChange={(e) => {
                          setPostcode(e.target.value);
                          setChecked(false);
                          setRouteResult(null);
                          setRouteError("");
                        }}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 uppercase outline-none focus:border-slate-900"
                        placeholder="e.g. CF33 4XX"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={onCheckArea}
                      className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                    >
                      {loadingRoute ? "Checking…" : "Check area"}
                    </button>
                  </div>

                  {hasError && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                      {routeError}
                    </div>
                  )}

                  {covered && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                      ✅ We cover your postcode. We’re in your area on{" "}
                      <span className="font-semibold">{coverageDateText}</span>
                      {route.area ? (
                        <>
                          {" "}
                          (<span className="font-semibold">{route.area}</span>)
                        </>
                      ) : null}
                      .
                    </div>
                  )}

                  {notCovered && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                      Sorry — we don’t cover that postcode yet.
                      <div className="mt-2 text-rose-800/80">
                        You can still contact us and we’ll advise if we can help.
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="text-sm font-semibold text-slate-900">2) Request your quote</div>
                  <p className="mt-2 text-sm text-slate-600">
                    The quickest way is to send a short description and a few photos. We’ll confirm
                    the price and agree a date.
                  </p>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <a
                      href={mailto}
                      className="inline-flex flex-1 items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                    >
                      Email for a quote
                    </a>
                    <Link
                      href="/contact"
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
                    >
                      Use contact form →
                    </Link>
                  </div>

                  <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">What to include</div>
                    <ul className="mt-2 list-disc pl-5 space-y-1 text-slate-600">
                      <li>Postcode + address (or nearest street)</li>
                      <li>Type: house / shed / garden</li>
                      <li>Any access issues (stairs, narrow paths, parking)</li>
                      <li>Photos (wide shots + any bulky items)</li>
                      <li>Preferred dates</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-900">Responsible disposal</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    We sort and dispose through appropriate routes, prioritising reuse and recycling
                    where possible.
                  </p>

                  <div className="mt-4 space-y-3">
                    <InfoRow title="Assessment first" text="We quote based on the actual job, not guesswork." />
                    <InfoRow title="Clear pricing" text="You’ll know the total before we book the date." />
                    <InfoRow title="Efficient clearance" text="We arrive, load and clear — no hassle." />
                  </div>

                  <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">Prefer item booking?</div>
                    <div className="mt-1 text-slate-600">
                      For single items or small collections, use our online booking:
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Link
                        href="/furniture"
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                      >
                        Furniture
                      </Link>
                      <Link
                        href="/appliances"
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                      >
                        Appliances
                      </Link>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>

          {/* Footer CTA */}
          <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-base font-semibold text-slate-900">
                  Ready to get it cleared?
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Check your postcode and request a quote — we’ll take it from there.
                </div>
              </div>
              <a
                href="#quote"
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Get a quote
              </a>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function Card({ title, text, bullets }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-sm text-slate-600">{text}</div>
      {bullets?.length ? (
        <ul className="mt-4 space-y-1 text-sm text-slate-700">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="text-slate-400">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function InfoRow({ title, text }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{text}</div>
    </div>
  );
}
