import Link from "next/link";
import BasketButton from "./BasketButton";


export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-[#f7f9ff] text-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="mx-auto max-w-6xl px-4">
          <div className="h-16 flex items-center justify-between gap-4">
            {/* Logo */}
            <Link href="/" className="font-extrabold tracking-tight text-xl">
              <span className="text-slate-900">AROC</span>{" "}
              <span className="text-indigo-600">Waste</span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              <Link href="/bins-bags" className="hover:text-indigo-600">
                Bins / Bags
              </Link>
              <Link href="/man-van" className="hover:text-indigo-600">
                Man &amp; Van
              </Link>
              <Link href="/furniture" className="hover:text-indigo-600">
                Furniture
              </Link>
              <Link href="/appliances" className="hover:text-indigo-600">
                Appliances
              </Link>
              <Link href="/clearances" className="hover:text-indigo-600">
                Clearances
              </Link>
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <a
                href="tel:01656470040"
                className="hidden sm:inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:border-slate-300"
              >
                <span className="text-slate-500">📞</span> 01656 470040
              </a>
                  <BasketButton />


              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Log in
              </Link>

              {/* Mobile menu (simple) */}
              <details className="md:hidden relative">
                <summary className="list-none cursor-pointer rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
                  Menu
                </summary>
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-100 bg-white shadow-lg overflow-hidden">
                  <Link className="block px-4 py-3 hover:bg-slate-50" href="/bins-bags">
                    Bins / Bags
                  </Link>
                  <Link className="block px-4 py-3 hover:bg-slate-50" href="/man-van">
                    Man &amp; Van
                  </Link>
                  <Link className="block px-4 py-3 hover:bg-slate-50" href="/furniture">
                    Furniture
                  </Link>
                  <Link className="block px-4 py-3 hover:bg-slate-50" href="/appliances">
                    Appliances
                  </Link>
                  <Link className="block px-4 py-3 hover:bg-slate-50" href="/clearances">
                    Clearances
                  </Link>
                  <a className="block px-4 py-3 hover:bg-slate-50" href="tel:01656470040">
                    📞 01656 470040
                  </a>
                  <Link className="block px-4 py-3 hover:bg-slate-50" href="/login">
                    Log in
                  </Link>
                </div>
              </details>
            </div>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="mt-16 border-t border-slate-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-600">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} AROC Waste</p>
            <p className="flex gap-4">
              <Link className="hover:text-indigo-600" href="/contact">
                Contact
              </Link>
              <Link className="hover:text-indigo-600" href="/terms">
                Terms
              </Link>
              <Link className="hover:text-indigo-600" href="/privacy">
                Privacy
              </Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
