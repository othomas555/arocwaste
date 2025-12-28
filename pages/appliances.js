// pages/appliances.js
import Link from "next/link";
import Layout from "../components/layout";
import { appliances } from "../data/appliances";

function formatGBP(amount) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
  }).format(amount);
}

function getMostBooked(items) {
  // Prefer a popular item if available, otherwise first item.
  const popular = items.find((i) => i.popular);
  return popular || items[0] || null;
}

export default function AppliancesPage() {
  const popular = appliances.filter((i) => i.popular);
  const all = appliances;
  const mostBooked = getMostBooked(appliances);

  return (
    <Layout
      title="Appliance Collection | AROC Waste"
      description="Book an appliance collection online. Choose your item, pick a date, add extras, and pay securely."
    >
      {/* Page background like Furniture */}
      <div className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
          {/* Top crumb + hero row */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
              <span className="text-slate-400">AROC Waste</span>
              <span className="text-slate-300">•</span>
              <span>Appliance collections</span>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-12 lg:items-start">
              {/* Left hero text */}
              <div className="lg:col-span-7">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  Appliance collection, booked online.
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                  Choose the closest match, pick a collection date for your area,
                  add extras if needed (timed arrival or remove-from-property),
                  then pay securely online.
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href="#items"
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  >
                    View items
                  </Link>
                  <Link
                    href="/book/appliances"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
                  >
                    Start a booking →
                  </Link>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  {[
                    "Card payments",
                    "Fast booking",
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

              {/* Right "Most booked" card */}
              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">
                    Most booked
                  </div>

                  {mostBooked ? (
                    <>
                      <div className="mt-2 text-base font-semibold text-slate-900">
                        {mostBooked.title}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        From {formatGBP(mostBooked.price)}
                      </div>

                      <Link
                        href={`/book/appliances?item=${encodeURIComponent(
                          mostBooked.slug
                        )}`}
                        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                      >
                        Get started
                      </Link>

                      <p className="mt-3 text-xs text-slate-500">
                        Tip: Add notes during checkout if access is tight or parking is limited.
                      </p>
                    </>
                  ) : (
                    <div className="mt-2 text-sm text-slate-600">
                      No items found.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Divider band like Furniture section area */}
          <div className="-mx-4 border-t border-slate-200 bg-slate-50 px-4 py-10 sm:py-12">
            <div className="mx-auto max-w-6xl">
              {/* Popular items */}
              {popular.length > 0 && (
                <>
                  <div className="mb-5">
                    <h2 className="text-xl font-semibold text-slate-900">
                      Popular items
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      The most common appliance collections we do.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {popular.map((item) => (
                      <Link
                        key={item.slug}
                        href={`/book/appliances?item=${encodeURIComponent(
                          item.slug
                        )}`}
                        className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
                      >
                        <div className="flex items-center gap-4">
                          {/* Simple icon placeholder like furniture cards */}
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
                            <span className="text-lg">▦</span>
                          </div>

                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {item.title}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-600">
                              {item.subtitle}
                            </div>

                            <div className="mt-3">
                              <span className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                                Popular
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-3">
                          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {formatGBP(item.price)}
                            <span className="text-slate-400 font-normal">
                              from
                            </span>
                          </div>

                          <span className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-slate-800">
                            Get started →
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              )}

              {/* All items */}
              <div className={popular.length > 0 ? "mt-12" : ""} id="items">
                <h2 className="text-xl font-semibold text-slate-900">
                  All appliance items
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Choose the closest match — you can add notes at checkout. Quantity can be adjusted during booking.
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {all.map((item) => (
                    <Link
                      key={item.slug}
                      href={`/book/appliances?item=${encodeURIComponent(
                        item.slug
                      )}`}
                      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
                            <span className="text-lg">▦</span>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {item.title}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-600">
                              {item.subtitle}
                            </div>

                            <div className="mt-3 text-xs text-slate-500">
                              Quick online booking
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-3">
                          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {formatGBP(item.price)}
                            <span className="text-slate-400 font-normal">
                              from
                            </span>
                          </div>

                          <span className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-slate-800">
                            Get started →
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                {/* Helpful note box like Furniture */}
                <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-slate-900">
                    Extras available during booking
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    You can add timed arrival options and “Remove from property” if items
                    need to come from inside.
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* end band */}
        </div>
      </div>
    </Layout>
  );
}
