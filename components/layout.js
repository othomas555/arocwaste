import Link from "next/link";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-white">
      {/* HEADER */}
      <header className="px-4 py-4 border-b border-gray-100">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          
          {/* Logo / Brand */}
          <Link href="/" className="text-lg font-semibold tracking-tight">
            AROC Waste
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/" className="text-gray-700 hover:text-gray-900">
              Home
            </Link>

            <Link href="/furniture" className="text-gray-700 hover:text-gray-900">
              Furniture
            </Link>

            <Link href="/appliances" className="text-gray-700 hover:text-gray-900">
              Appliances
            </Link>

            {/* Primary action */}
            <Link
              href="/quote"
              className="inline-flex items-center justify-center rounded-2xl px-4 py-2 font-semibold bg-gray-900 text-white"
            >
              Get a quote
            </Link>
          </nav>
        </div>
      </header>

      {/* PAGE CONTENT */}
      {children}
    </div>
  );
}
