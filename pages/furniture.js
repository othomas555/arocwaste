import Link from "next/link";
import Layout from "../components/layout";
import furniture from "../data/furniture";

function normalizeItems(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    return Object.entries(data).map(([id, v]) => ({ id, ...v }));
  }
  return [];
}

function getTitle(item) {
  return item.title || item.name || item.label || item.id;
}

function getPrice(item) {
  const n = Number(item.price ?? item.basePrice ?? item.cost ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function Card({ item }) {
  const title = getTitle(item);
  const price = getPrice(item);

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
      <div className="h-40 bg-indigo-600 flex items-center justify-center">
        <div className="text-6xl">🛋️</div>
      </div>

      <div className="p-6">
        <div className="text-xs font-bold tracking-widest text-slate-500">
          FURNITURE
        </div>

        <h3 className="mt-2 text-lg font-semibold text-slate-900">{title}</h3>

        <div className="mt-2 text-indigo-600 font-semibold">
          from £{price.toFixed(2)}
        </div>

        <p className="mt-3 text-sm text-slate-600">
          Pick a date, choose time options, and add-ons if you need help moving it.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link
            href={`/furniture#${item.id}`}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold hover:border-slate-300"
          >
            More info
          </Link>

          <Link
            href={`/book/furniture?item=${encodeURIComponent(item.id)}`}
            className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Get started
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function FurniturePage() {
  const items = normalizeItems(furniture);

  return (
    <Layout>
      <div className="bg-[#f7f9ff]">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="max-w-3xl">
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
              Furniture collections
            </h1>
            <p className="mt-4 text-slate-600">
              Choose an item and book a collection in minutes.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={item.id} id={item.id}>
                <Card item={item} />
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">
              Need help choosing?
            </h2>
            <p className="mt-2 text-slate-600">
              If it’s not listed, call us — we’ll advise and book it in.
            </p>
            <div className="mt-5">
              <a
                href="tel:01656470040"
                className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Call 01656 470040
              </a>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
