// data/furniture.js

export const furnitureItems = [
  {
    id: "sofas-armchairs",
    title: "Sofas & armchairs",
    price: 35,
    desc: "Single items or small sets. Ideal for quick collections.",
    popular: true,
    icon: "sofa",
  },
  {
    id: "mattresses",
    title: "Mattresses",
    price: 30,
    desc: "Single or multiple mattresses. Please keep dry if possible.",
    popular: true,
    icon: "mattress",
  },
  {
    id: "bed-frames",
    title: "Bed frames",
    price: 35,
    desc: "Frames, headboards, bases (dismantling by arrangement).",
    popular: true,
    icon: "bed",
  },
  {
    id: "wardrobes",
    title: "Wardrobes",
    price: 45,
    desc: "Single wardrobes or flatpack units. Photos help for sizing.",
    popular: true,
    icon: "wardrobe",
  },
  {
    id: "tables-chairs",
    title: "Tables & chairs",
    price: 30,
    desc: "Dining tables, office desks, chairs and small furniture.",
    popular: false,
    icon: "table",
  },
  {
    id: "white-goods",
    title: "White goods",
    price: 35,
    desc: "Washing machines, cookers, tumble dryers and more.",
    popular: false,
    icon: "appliance",
  },
  {
    id: "fridges-freezers",
    title: "Fridges & freezers",
    price: 50,
    desc: "Handled correctly under WEEE rules (photo required).",
    popular: false,
    icon: "fridge",
  },
  {
    id: "mixed-bulky-load",
    title: "Mixed bulky load",
    price: 65,
    desc: "A few bulky items together — easiest with photos.",
    popular: false,
    icon: "truck",
  },
];

// Optional: keep if you want a “How it works” section later
export const furnitureSteps = [
  { title: "Choose an item", desc: "Pick what you need collecting and book online." },
  { title: "Pick a date", desc: "Choose the next available collection day for your area." },
  { title: "Pay by card", desc: "Secure online payment (Stripe)." },
  { title: "We collect", desc: "Our driver collects and disposes responsibly." },
];
