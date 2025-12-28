import Layout from "../components/layout";

export default function ContactPage() {
  return (
    <Layout>
      <div className="bg-[#f7f9ff]">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Contact AROC Waste
            </h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              Call us if you’re not sure which service you need, or if you want
              a quick quote for a clearance.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <a
                href="tel:01656470040"
                className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Call 01656 470040
              </a>

              <a
                href="mailto:hello@arocwaste.co.uk"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold hover:border-slate-300"
              >
                Email us
              </a>

              <a
                href="https://wa.me/"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold hover:border-slate-300"
              >
                WhatsApp (add link)
              </a>
            </div>

            <div className="mt-8 rounded-2xl bg-slate-50 p-5 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Service areas</p>
              <p className="mt-1">
                Bridgend • Pyle • Porthcawl (and nearby)
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
