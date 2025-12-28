import Link from "next/link";
import Layout from "../components/layout";

export default function BinsBagsPage() {
  return (
    <Layout>
      <div className="bg-[#f7f9ff]">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Bins / Bags collections
            </h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              We’re building this service page now. For the moment, you can book
              our most popular collections through Furniture or Appliances.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Link
                href="/furniture"
                className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Book Furniture collection
              </Link>

              <Link
                href="/appliances"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold hover:border-slate-300"
              >
                Book Appliances collection
              </Link>
            </div>

            <div className="mt-8 rounded-2xl bg-slate-50 p-5 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">What’s coming here</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Subscription options</li>
                <li>Pay-as-you-go bag collections</li>
                <li>Postcode check + your collection day</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
