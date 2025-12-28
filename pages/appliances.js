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

export default function AppliancesPage() {
  const popular = appliances.filter((i) => i.popular);
  const all = appliances;

  return (
    <Layout
      title="Appliance Collection | AROC Waste"
      description="Book an appliance collection online. Choose your item, pick a date, add any extras, and pay securely."
    >
      <div className="bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Appliance collections in South Wales
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Appliance collection, booked online.
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/80">
                Pick your item, choose a collection date, add any extras (like timed
                arrival or remove-from-property), then pay securely. Simple, fast,
                and fully tracked.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="#items"
                  className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-white/95"
                >
                  Browse appliance items
                </Link>
                <Link
                  href="/book/appliances"
                  className="inline-flex items-center justify-center rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15"
                >
                  Start booking
                </Link>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Secure card payment", value: "Stripe Checkout" },
                  { label: "Flexible extras", value: "Time + removal" },
                  { label: "Instant confirmation", value: "Email receipt" },
                  { label: "Simple pricing", value: "Per-item + qty" },
                ].map((x) => (
                  <div
                    key={x.label}
                    className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10"
                  >
                    <div className="text-xs text-white/70">{x.label}</div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {x.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
                <div className="text-sm font-semibold text-white">
                  Popular items
                </div>
                <p className="mt-1 text-sm text-white/75">
                  Click an item to start your booking.
                </p>

                <div className="mt-4 grid gap-3">
                  {popular.map((item) => (
                    <Link
                      key={item.slug}
                      href={`/book/appliances?item=${encodeURIComponent(
                        item.slug
                      )}`}
                      className="group flex items-center justify-between gap-4 rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10 transition hover:bg-white/10"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {item.title}
                        </div>
                        <div className="text-xs text-white/70">
                          {item.subtitle}
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-semibold text-white">
                        {formatGBP(item.price)}
                        <span className="ml-2 text-white/60 transition group-hover:translate-x-0.5">
                          →
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-500/20">
                  <div className="text-sm font-semibold text-emerald-200">
                    Need items removed from inside?
                  </div>
                  <p className="mt-1 text-sm text-emerald-100/80">
                    You can add “Remove from property” during booking.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div id="items" className="mt-12 sm:mt-16">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  All appliance items
                </h2>
                <p className="mt-1 text-sm text-white/70">
                  Straightforward per-item pricing. Quantity can be adjusted in the booking flow.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {all.map((item) => (
                <Link
                  key={item.slug}
                  href={`/book/appliances?item=${encodeURIComponent(item.slug)}`}
                  className="group rounded-3xl bg-white/5 p-5 ring-1 ring-white/10 transition hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-base font-semibold text-white">
                        {item.title}
                      </div>
                      <div className="mt-1 text-sm text-white/70">
                        {item.subtitle}
                      </div>
                    </div>

                    <div className="shrink-0 rounded-2xl bg-white/10 px-3 py-1 text-sm font-semibold text-white ring-1 ring-white/10">
                      {formatGBP(item.price)}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-xs text-white/60">
                      Click to book →
                    </div>
                    {item.popular ? (
                      <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-400/20">
                        Popular
                      </span>
                    ) : (
                      <span className="text-xs text-white/40"> </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-10 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h3 className="text-base font-semibold text-white">
                What happens next?
              </h3>
              <ul className="mt-2 grid gap-2 text-sm text-white/75 sm:grid-cols-2">
                <li>• Choose your item</li>
                <li>• Enter postcode (we’ll confirm your route/day)</li>
                <li>• Pick an available collection date</li>
                <li>• Add time options / removal-from-property if needed</li>
                <li>• Adjust quantity</li>
                <li>• Pay securely and get instant confirmation</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
