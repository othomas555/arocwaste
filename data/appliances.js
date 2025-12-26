// data/appliances.js

export const applianceItems = [
  {
    id: "undercounter-fridge",
    title: "Undercounter fridge or freezer",
    desc: "Small undercounter unit. Photo required.",
    price: 30,
    photoRequired: true,
  },
  {
    id: "upright-fridge-freezer",
    title: "Upright fridge / fridge-freezer (up to 600mm)",
    desc: "Standard kitchen fridge or fridge-freezer. Photo required.",
    price: 50,
    photoRequired: true,
  },
  {
    id: "american-fridge-freezer",
    title: "American-style fridge freezer",
    desc: "Large double-door unit. Photo required.",
    price: 65,
    photoRequired: true,
  },
  {
    id: "commercial-fridge",
    title: "Commercial fridge or freezer",
    desc: "Shop, catering or commercial unit. Photo required.",
    price: 100,
    photoRequired: true,
  },

  {
    id: "washing-machine",
    title: "Washing machine",
    desc: "Please disconnect in advance if possible.",
    price: 45,
    photoRequired: false,
  },
  {
    id: "tumble-dryer",
    title: "Tumble dryer",
    desc: "Vented or condenser dryer.",
    price: 45,
    photoRequired: false,
  },
  {
    id: "dishwasher",
    title: "Dishwasher",
    desc: "Please disconnect in advance if possible.",
    price: 45,
    photoRequired: false,
  },
  {
    id: "cooker-oven",
    title: "Cooker / oven",
    desc: "Freestanding preferred. Photo recommended.",
    price: 55,
    photoRequired: true,
  },
  {
    id: "microwave",
    title: "Microwave",
    desc: "Small countertop appliance.",
    price: 25,
    photoRequired: false,
  },
];

export const timeOptions = [
  { id: "any", title: "Any", price: 0, note: "Free" },
  { id: "morning", title: "Morning", price: 10, note: "+£10.00" },
  { id: "afternoon", title: "Afternoon", price: 10, note: "+£10.00" },
  { id: "two-hour", title: "Choose 2 hour time slot", price: 25, note: "+£25.00" },
];

export const removalOptions = [
  { id: "no", title: "No", price: 0, note: "Free" },
  { id: "yes", title: "Yes", price: 20, note: "+£20.00" },
];
