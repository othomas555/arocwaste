// data/furniture.js

export const furnitureItems = [
  {
    id: "sofas-armchairs",
    title: "Sofas & armchairs",
    price: 35,
    desc: "Single items or small sets. Ideal for quick collections.",
  },
  {
    id: "mattresses",
    title: "Mattresses",
    price: 30,
    desc: "Single or multiple mattresses. Please keep dry if possible.",
  },
  {
    id: "bed-frames",
    title: "Bed frames",
    price: 35,
    desc: "Frames, headboards, bases (dismantling by arrangement).",
  },
  {
    id: "wardrobes",
    title: "Wardrobes",
    price: 45,
    desc: "Single wardrobes or flatpack units. Photos help for sizing.",
  },
  {
    id: "tables-chairs",
    title: "Tables & chairs",
    price: 30,
    desc: "Dining tables, office desks, chairs and small furniture.",
  },
  {
    id: "white-goods",
    title: "White goods",
    price: 35,
    desc: "Washing machines, cookers, tumble dryers and more.",
  },
  {
    id: "fridges-freezers",
    title: "Fridges & freezers",
    price: 50,
    desc: "Handled correctly under WEEE rules (photo required).",
  },
  {
    id: "mixed-bulky-load",
    title: "Mixed bulky load",
    price: 65,
    desc: "A few bulky items together — easiest with photos.",
  },
];

// Optional: keep if you want a “How it works” section later
export const furnitureSteps = [
  { title: "Choose an item", desc: "Pick what you need collecting and book online." },
  { title: "Pick a date", desc: "Choose the next available collection day for your area." },
  { title: "Pay by card", desc: "Secure online payment (Stripe)." },
  { title: "We collect", desc: "Our driver collects and disposes responsibly." },
];
