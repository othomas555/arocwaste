import Head from "next/head";

const items = [
  { title: "Sofas & armchairs", desc: "Single items or small sets. Ideal for quick collections." },
  { title: "Mattresses", desc: "Single or multiple mattresses. Please keep dry if possible." },
  { title: "Bed frames", desc: "Frames, headboards, bases (dismantling by arrangement)." },
  { title: "Wardrobes", desc: "Single wardrobes or flatpack units. Photos help for sizing." },
  { title: "Tables & chairs", desc: "Dining tables, office desks, chairs and small furniture." },
  { title: "White goods", desc: "Washing machines, cookers, tumble dryers and more." },
  { title: "Fridges & freezers", desc: "Handled correctly under WEEE rules (photo required)." },
  { title: "Mixed bulky load", desc: "A few bulky items together — easiest with photos." },
];

const steps = [
  { title: "Send photos", desc: "Upload a photo of the items and tell us your postcode." },
  { title: "Get a fixed quote", desc: "We confirm price and what’s included — no surprises." },
  { title: "Choose a slot", desc: "Pick a collection day that suits you." },
  { title: "We collect & dispose", desc: "Collected by a licensed carrier and disposed responsibly." },
];

export default function FurniturePage() {
  return (
    <>
      <Head>
        <title>Furniture Removal & Bulky Waste Collection | AROC Waste</title>
        <meta
          name="description"
          content="Book furniture and bulky waste removal in South Wales. Upload photos, get a fixed quote, and choose a collection slot. Licensed waste carrier. Card payment."
        />
      </Head>

      <main className="min-h-screen bg-white">
        {/* HERO */}
        <section className="px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight">
                Furniture & bulky waste removal
              </h1>
              <p className="mt-4 text-base sm:text-lg text-gray-600">
                Simple, fixed-price collections for your home. Upload a photo, get a quote, book a slot.
              </p>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <a
                  href="/quote?service=furniture"
                  className="inline-flex items-center justify-center rounded-2xl px-5 py-3 text-base font-semibold bg-gray-900 text-white shadow-sm"
                >
                  Get a quote
                </a>
                <a
                  href="#what-we-collect"
                  className="inline-flex items-center justify-center rounded-2xl px-5 py-3 text-base font-semibold border border-gray-200 text-gray-900"
                >
                  See what we collect
                </a>
              </div>

              <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {[
                  "Licensed waste carrier",
                  "Card payment only",
                  "Local South Wales",
                  "Reliable time slots",
                ].map((t) => (
                  <div key={t} className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2 text-gray-700">
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* GRID */}
        <section id="what-we-collect" className="px-4 py-12 bg-gray-50">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-end justify-between gap-6">
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">What we collect</h2>
                <p className="mt-2 text-gray-600">
                  Choose the closest match — photos help us price it accurately.
                </p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {items.map((it) => (
                <div key={it.title} className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
                  <div className="h-10 w-10 rounded-2xl bg-gray-100 mb-4" />
                  <h3 className="text-lg font-semibold">{it.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{it.desc}</p>
                  <div className="mt-4">
                    <a
                      href={`/quote?service=furniture&item=${encodeURIComponent(it.title)}`}
                      className="text-sm font-semibold text-gray-900 underline underline-offset-4"
                    >
                      Get a quote
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="px-4 py-12">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">How it works</h2>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {steps.map((s, idx) => (
                <div key={s.title} className="rounded-2xl border border-gray-100 p-5">
                  <div className="text-sm font-semibold text-gray-500">Step {idx + 1}</div>
                  <div className="mt-2 text-lg font-semibold">{s.title}</div>
                  <p className="mt-2 text-sm text-gray-600">{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
                <h3 className="font-semibold">What’s included</h3>
                <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-inside">
                  <li>Collection and disposal</li>
                  <li>Licensed carrier handling</li>
                  <li>Clear pricing confirmed before payment</li>
                </ul>
              </div>
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
                <h3 className="font-semibold">Access requirements</h3>
                <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-inside">
                  <li>Items should be accessible (driveway/kerbside where possible)</li>
                  <li>Dismantling only if agreed in advance</li>
                  <li>Please send photos for accurate quoting</li>
                </ul>
              </div>
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
                <h3 className="font-semibold">Fridges & freezers</h3>
                <p className="mt-3 text-sm text-gray-700">
                  We handle these correctly under WEEE rules. Please include a clear photo and note if it’s a fridge-freezer.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA BAND */}
        <section className="px-4 py-12 bg-gray-900">
          <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold text-white">Ready to book?</h2>
              <p className="mt-2 text-gray-300">
                Upload photos and we’ll confirm a fixed quote and collection slot.
              </p>
            </div>
            <a
              href="/quote?service=furniture"
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
    </>
  );
}
