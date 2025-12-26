import Link from "next/link";
import Layout from "../components/layout";
import appliances from "../data/appliances";

function normalizeAppliances(data) {
  // Supports:
  // 1) Array: [{ id, title/name, price }]
  // 2) Object map: { id: { title/name, price } }
  if (Array.isArray(data)) return data;

  if (typeof data === "object" && data !== null) {
    return Object.entries(data).map(([id, value]) => ({
      id,
      ...(value || {}),
    }));
  }

  return [];
}

function getTitle(item) {
  return item.title || item.name || item.label || item.id;
}

function getPrice(item) {
  const p = item.price ?? item.basePrice ?? item.cost;
  const n = Number(p);
  return Number.isFinite(n) ? n : 0;
}

export default function AppliancesPage() {
  const items = normalizeAppliances(appliances);

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Appliances</h1>
        <p className="mt-2 text-gray-600">
          Choose an item to book a collection.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="text-lg font-semibold">{getTitle(item)}</div>
              <div className="mt-1 text-sm text-gray-600">From £{getPrice(item)}</div>

              <div className="mt-5">
                <Link
                  href={`/book/appliances?item=${encodeURIComponent(item.id)}`}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-black px-5 py-3 text-white hover:opacity-90"
                >
                  Book collection
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
