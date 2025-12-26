import Head from "next/head";
import Layout from "../components/layout";
import { applianceItems } from "../data/appliances";

export default function AppliancesPage() {
  return (
    <>
      <Head>
        <title>Appliance Collection (Fridges, Freezers, Washing Machines) | AROC Waste</title>
        <meta
          name="description"
          content="Book appliance and WEEE collection in South Wales. Choose your item, see the price, and get started. Licensed waste carrier. Card payment."
        />
      </Head>

      <Layout>
        <main className="min-h-screen bg-white">
          {/* HERO */}
          <section className="px-4 py-12 sm:py-16">
            <div className="mx-auto max-w-6xl">
              <div className="max-w-2xl">
                <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight">
                  Appliance collection
                </h1>
                <p className="mt-4 text-base sm:text-lg text-gray-600">
                  Fixed-price collections for common appliances. Choose an item below to get started.
                </p>

                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <a
                    href="#appliance-list"
                    className="inline-flex items-center justify-center rounded-2xl px-5 py-3 text-base font-semibold bg-gray-900 text-white shadow-sm"
                  >
                    See prices
                  </a>
                  <a
                    href="/quote?service=appliances"
                    className="inline-flex items-center justify-center rounded-2xl px-5 py-3 text-base font-semibold border border-gray-200 text-gray-900"
                  >
                    Get a quote
                  </a>
                </div>

                <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  {[
                    "WEEE handled correctly",
                    "Card payment only",
                    "Local South Wales",
                    "Photos help accuracy",
                  ].map((t) => (
                    <div
                      key={t}
                      className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2 text-gray-700"
                    >
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* LIST */}
          <section id="appliance-list" className="px-4 py-12 bg-gray-50">
            <div className="mx-auto max-w-6xl">
              <div className="flex items-end justify-between gap-6">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                    Prices (per item)
                  </h2>
                  <p className="mt-2 text-gray-600">
                    Base prices assume easy access (ground floor/driveway/kerbside). If it’s awkward access or stairs,
                    we’ll confirm from photos.
                  </p>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {applianceItems.map((it) => (
                  <div
                    key={it.id}
                    className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm flex flex-col"
                  >
                    <div className="h-10 w-10 rounded-2xl bg-gray-100 mb-4" />

                    <h3 className="text-lg font-semibold">{it.title}</h3>
                    <p className="mt-2 text-sm text-gray-600">{it.desc}</p>

                    <div className="mt-4 flex items-baseline justify-between">
                      <div className="text-lg font-semibold">£{it.price}</div>
                      {it.photoRequired ? (
                        <span className="text-xs rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                          Photo required
                        </span>
                      ) : (
                        <span className="text-xs rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                          Photo helpful
                        </span>
                      )}
                    </div>

                    <div className="mt-5">
                      <a
                        href={`/quote?service=appliances&item=${encodeURIComponent(it.id)}`}
                        className="inline-flex w-full items-center justify-center rounded-2xl px-4 py-2 font-semibold bg-gray-900 text-white"
                      >
                        Get started
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-700">
                <p className="font-semibold">Notes</p>
                <ul className="mt-3 space-y-2 list-disc list-inside">
                  <li>Fridges/freezers should be empty. Defrost where possible.</li>
                  <li>Please send photos so we can confirm access and handling.</li>
                  <li>Commercial units must be declared (different disposal costs).</li>
                </ul>
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="px-4 py-12 bg-gray-900">
            <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold text-white">Ready to book?</h2>
                <p className="mt-2 text-gray-300">
                  Choose an item above and click “Get started”.
                </p>
              </div>
              <a
                href="/quote?service=appliances"
                className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-base font-semibold bg-white text-gray-900 shadow-sm"
              >
                Get a quote
              </a>
            </div>
          </section>

          {/* FOOTER NOTE */}
          <footer className="px-4 py-10">
            <div className="mx-auto max-w-6xl text-xs text-gray-500">
              Operated by Cox Skips & Waste Management Ltd. Licensed waste carrier. Terms &amp; Privacy apply.
            </div>
          </footer>
        </main>
      </Layout>
    </>
  );
}
