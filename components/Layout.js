import Link from "next/link";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="px-4 py-4 border-b border-gray-100">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link href="/" className="font-semibold">
            AROC Waste
          </Link>

          <div className="flex items-center gap-4 text-sm">
            <Link href="/furniture" className="text-gray-700 hover:text-gray-900">
              Furniture
            </Link>

            <Link
              href="/quote?service=furniture"
              className="rounded-2xl px-4 py-2 font-semibold bg-gray-900 text-white"
            >
              Get a quote
            </Link>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}

