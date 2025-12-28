// components/BasketButton.js
import Link from "next/link";
import { useEffect, useState } from "react";
import { basketCount, basketSubscribe } from "../utils/basket";

export default function BasketButton() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = () => setCount(basketCount());
    refresh();
    const unsub = basketSubscribe(refresh);
    return unsub;
  }, []);

  return (
    <Link
      href="/basket"
      className="relative inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
      aria-label="Basket"
    >
      Basket
      <span className="ml-2 inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
        {count}
      </span>
    </Link>
  );
}
