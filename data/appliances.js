// data/appliances.js
// Appliance items (item-based like Furniture). Prices are in GBP.

export const appliances = [
  {
    slug: "small-kitchen-appliance",
    title: "Small kitchen appliance",
    subtitle: "Kettle / toaster / air fryer size",
    price: 5,
    popular: false,
  },
  {
    slug: "medium-appliance",
    title: "Medium appliance",
    subtitle: "A medium-sized household appliance",
    price: 15,
    popular: false,
  },
  {
    slug: "large-appliance",
    title: "Large appliance",
    subtitle: "A large household appliance",
    price: 25,
    popular: false,
  },

  // Popular items
  {
    slug: "fridge-or-freezer",
    title: "Standard fridge or freezer",
    subtitle: "Fridge, freezer, or fridge-freezer (standard size)",
    price: 35,
    popular: true,
  },
  {
    slug: "cooker",
    title: "Cooker",
    subtitle: "Freestanding cooker",
    price: 25,
    popular: true,
  },
  {
    slug: "tumble-dryer",
    title: "Tumble dryer",
    subtitle: "Any standard tumble dryer",
    price: 25,
    popular: true,
  },
  {
    slug: "washing-machine",
    title: "Washing machine",
    subtitle: "Any standard washing machine",
    price: 25,
    popular: true,
  },
  {
    slug: "dishwasher",
    title: "Dishwasher",
    subtitle: "Any standard dishwasher",
    price: 25,
    popular: true,
  },
  {
    slug: "tv-or-monitor",
    title: "TV / Monitor",
    subtitle: "Television or computer monitor",
    price: 25,
    popular: true,
  },

  // Other specific items
  {
    slug: "american-fridge-freezer",
    title: "American-style fridge freezer",
    subtitle: "Large double-door / American-style unit",
    price: 55,
    popular: false,
  },
  {
    slug: "chest-freezer",
    title: "Chest freezer",
    subtitle: "Large chest-style freezer",
    price: 35,
    popular: false,
  },

  // Small named items (also covered by small-kitchen-appliance, but listed for clarity)
  {
    slug: "kettle",
    title: "Kettle",
    subtitle: "Electric kettle",
    price: 5,
    popular: false,
  },
  {
    slug: "toaster",
    title: "Toaster",
    subtitle: "Any toaster",
    price: 5,
    popular: false,
  },
  {
    slug: "air-fryer",
    title: "Air fryer",
    subtitle: "Countertop air fryer",
    price: 5,
    popular: false,
  },
];

export function getApplianceBySlug(slug) {
  return appliances.find((i) => i.slug === slug) || null;
}

// For convenience if any pages import default
export default appliances;
