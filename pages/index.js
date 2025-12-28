import { useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../components/layout";

function AccordionItem({ title, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-base font-semibold text-slate-900">{title}</span>
        <span className="text-slate-500">{open ? "▴" : "▾"}</span>
      </button>
      {open && <div className="pb-5 text-sm text-slate-600">{children}</div>}
    </div>
  );
}

function ServiceCard({ title, fromPrice, description, hrefMore, hrefStart, emoji }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
      <div className="h-44 bg-indigo-600 flex items-center justify-center">
        <div className="text-6xl drop-shadow-sm">{emoji}</div>
      </div>

      <div className="p-6">
        <div className="text-xs font-bold tracking-widest text-slate-500">
          {title.toUpperCase()}
        </div>

        <div className="mt-2 text-lg font-semibold text-indigo-600">
          from £{fromPrice}
        </div>

        <p className="mt-3 text-sm text-slate-600">{description}</p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link
            href={hrefMore}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold hover:border-slate-300"
          >
            More info
          </Link>
          <Link
            href={hrefStart}
            className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Get started
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [postcode, setPostcode] = useState("");

  const areas = useMemo(
    () => [
      {
        name: "Bridgend",
        detail:
          "Fast local collections across Bridgend and surrounding areas. Choose a service and book in minutes.",
      },
      {
        name: "Pyle",
        detail:
          "Covering Pyle and nearby villages. We’ll confirm your collection day during booking.",
      },
      {
        name: "Porthcawl",
        detail:
          "Porthcawl collections available — book online and we’ll handle the rest.",
      },
    ],
    []
  );

  const faqs = useMemo(
    () => [
      {
        q: "Do I need to be at home?",
        a: "Not usually. As long as the waste/items are accessible and clearly marked, we can collect without you being in. If we need access inside the property, choose the ‘remove from property’ option on the booking page (where available).",
      },
      {
        q: "How do I book?",
        a: "Pick a service, choose your options, enter your address and preferred date/time, then confirm. You’ll receive a confirmation on-screen and by email.",
      },
      {
        q: "What if there is more waste on the day?",
        a: "If there’s extra beyond what you booked, we can usually take it — but it may need an additional charge. If you can, add it to your booking notes or contact us before collection day.",
      },
      {
        q: "How is payment taken?",
        a: "Card payment online (we’ll be using Stripe for secure checkout). For now, your booking flow is set up to confirm details end-to-end, and we’ll switch payment on once you’re ready.",
      },
      {
        q: "When will I be billed?",
        a: "When payment is enabled, you’ll pay during checkout at the time of booking. You’ll get an email receipt and confirmation straight away.",
      },
    ],
    []
  );

  return (
    <Layout>
      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* subtle rings background */}
        <div className="absolute inset-0 bg-[#f7f9ff]" />
        <div className="absolute inset-0 opacity-40">
          <div className="mx-auto max-w-6xl px-4">
            <div className="relative h-[520px]">
              <div className="absolute left-1/2 top-28 -translate-x-1/2 h-[640px] w-[640px] rounded-full border border-indigo-200/40" />
              <div className="absolute left-1/2 top-44 -translate-x-1/2 h-[520px] w-[520px] rounded-full border border-indigo-200/40" />
              <div className="absolute left-1/2 top-60 -translate-x-1/2 h-[400px] w-[400px] rounded-full border border-indigo-200/40" />
            </div>
          </div>
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-indigo-700">
              getting rid of rubbish has never been easier
            </h1>

            <p className="mt-6 text-base sm:text-lg text-slate-700">
              Fast, simple waste collections across Bridgend, Pyle &amp; Porthcawl.
              Choose a service that suits you and we’ll take care of the rest.
            </p>

            {/* Postcode prompt (optional, nice touch like Bineezy) */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="Enter your postcode"
                className="w-full sm:w-72 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500"
              />
              <Link
                href="/bins-bags"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Book a collection
              </Link>
            </div>
          </div>

          {/* Service cards */}
          <div className="mt-14 grid gap-6 md:grid-cols-2">
            <ServiceCard
              title="Bins & Bag collections"
              fromPrice="16.50"
              description="Subscription or pay-as-you-go bin and bag collections. No need to rely on the council."
              hrefMore="/bins-bags"
              hrefStart="/bins-bags"
              emoji="🗑️"
            />
            <ServiceCard
              title="Man & Van collections"
              fromPrice="35.00"
              description="Need a hand with a house clearance or bulky waste collection? We’ll do the heavy lifting."
              hrefMore="/man-van"
              hrefStart="/man-van"
              emoji="🚚"
            />
          </div>
        </div>
      </section>

      {/* SIMPLE SIGN UP / PROCESS */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Simple sign up, <br className="hidden sm:block" />
                seamless service
              </h2>
              <p className="mt-4 text-slate-600">
                Getting rid of waste should be easy. Here’s how it works:
              </p>

              <div className="mt-6">
                <Link href="/bins-bags" className="text-indigo-600 font-semibold hover:underline">
                  Book a collection →
                </Link>
              </div>
            </div>

            <div className="space-y-6">
              {[
                {
                  n: "1",
                  title: "Check your postcode",
                  text:
                    "Check to see if we provide services in your area. If not, contact us and we’ll expand soon.",
                },
                {
                  n: "2",
                  title: "Choose a service",
                  text:
                    "Select bins/bags, Man & Van, furniture, appliances or a clearance — then pick your options.",
                },
                {
                  n: "3",
                  title: "Payment",
                  text:
                    "Secure card payments (Stripe). We accept all major credit and debit cards.",
                },
                {
                  n: "4",
                  title: "Collection",
                  text:
                    "Your order is placed and our drivers are notified. We’ll collect on the chosen day.",
                },
              ].map((step) => (
                <div key={step.n} className="flex gap-4">
                  <div className="h-10 w-10 shrink-0 rounded-full border border-slate-200 flex items-center justify-center font-bold text-slate-700">
                    {step.n}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">{step.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{step.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AREAS WE COVER */}
      <section className="bg-[#f7f9ff]">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Areas we cover
              </h2>
              <p className="mt-4 text-slate-600">
                We set collection days to keep routes efficient. During booking we’ll confirm
                your collection day and available options.
              </p>
              <div className="mt-6">
                <Link href="/bins-bags" className="text-indigo-600 font-semibold hover:underline">
                  Book a collection →
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              {areas.map((a) => (
                <AccordionItem key={a.name} title={a.name}>
                  {a.detail}
                </AccordionItem>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Your questions, answered
            </h2>
            <p className="mt-3 text-slate-600">
              Answers to the most frequently asked questions.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            {faqs.map((f) => (
              <AccordionItem key={f.q} title={f.q}>
                {f.a}
              </AccordionItem>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
