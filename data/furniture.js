// data/furniture.js

export const furnitureItems = [
  // Seating
  { id: "sofa-2-seater", title: "2-seater sofa", price: 35, desc: "Standard 2 seat sofa.", popular: true, icon: "sofa" },
  { id: "sofa-3-seater", title: "3-seater sofa", price: 45, desc: "Standard 3 seat sofa.", popular: true, icon: "sofa" },
  { id: "sofa-corner", title: "Corner sofa", price: 80, desc: "L-shaped / corner units.", popular: false, icon: "sofa" },
  { id: "armchair", title: "Arm chair", price: 25, desc: "Single armchair / accent chair.", popular: false, icon: "sofa" },
  { id: "sofa-bed", title: "Sofa bed", price: 70, desc: "Sofa bed frame (no mattress).", popular: false, icon: "sofa" },
  { id: "sofa-bed-mattress", title: "Sofa bed + mattress", price: 90, desc: "Sofa bed with mattress included.", popular: false, icon: "sofa" },
  { id: "footstool", title: "Footstool / ottoman", price: 10, desc: "Small stool/ottoman.", popular: false, icon: "table" },

  // Beds
  { id: "mattress", title: "Mattress", price: 40, desc: "Any size mattress (please keep dry).", popular: true, icon: "mattress" },
  { id: "bed-frame-divan", title: "Bed frame / divan base", price: 25, desc: "Frame, divan, or base unit.", popular: true, icon: "bed" },
  { id: "bed-and-mattress", title: "Bed + mattress", price: 60, desc: "Frame/base plus mattress.", popular: true, icon: "bed" },

  // Storage
  { id: "bookcase-small", title: "Bookcase (small)", price: 25, desc: "Small bookcase / shelving unit.", popular: false, icon: "wardrobe" },
  { id: "bookcase-medium", title: "Bookcase (medium)", price: 30, desc: "Medium bookcase / shelving unit.", popular: false, icon: "wardrobe" },
  { id: "bookcase-large", title: "Bookcase (large)", price: 35, desc: "Large/tall bookcase.", popular: false, icon: "wardrobe" },

  { id: "wardrobe-2-door", title: "Wardrobe (2 door)", price: 30, desc: "2-door wardrobe / flatpack.", popular: false, icon: "wardrobe" },
  { id: "wardrobe-3-door", title: "Wardrobe (3 door)", price: 45, desc: "3-door wardrobe / flatpack.", popular: true, icon: "wardrobe" },
  { id: "wardrobe-4-door", title: "Wardrobe (4 door)", price: 55, desc: "Large wardrobe unit.", popular: false, icon: "wardrobe" },

  { id: "sideboard", title: "Sideboard", price: 25, desc: "Sideboard / buffet unit.", popular: false, icon: "wardrobe" },
  { id: "chest-of-drawers", title: "Chest of drawers", price: 20, desc: "Drawers unit.", popular: false, icon: "wardrobe" },
  { id: "bedside-cabinet", title: "Bedside cabinet", price: 10, desc: "Bedside unit (each).", popular: false, icon: "wardrobe" },

  // Office
  { id: "office-desk", title: "Office desk", price: 30, desc: "Desk (standard size).", popular: false, icon: "table" },
  { id: "office-chair", title: "Office chair", price: 15, desc: "Desk chair.", popular: false, icon: "table" },

  // Fitness
  { id: "exercise-equipment", title: "Exercise equipment", price: 30, desc: "Gym equipment (single item).", popular: false, icon: "truck" },

  // Tables & extras
  { id: "table", title: "Table", price: 20, desc: "Dining/coffee/side table (standard).", popular: false, icon: "table" },
  { id: "chair", title: "Chair", price: 5, desc: "Single chair.", popular: false, icon: "table" },
  { id: "rug", title: "Rug", price: 15, desc: "Rolled rug (standard size).", popular: false, icon: "table" },
  { id: "side-table", title: "Side table", price: 10, desc: "Small side table.", popular: false, icon: "table" },
  { id: "coffee-table", title: "Coffee table", price: 15, desc: "Coffee table.", popular: false, icon: "table" },
  { id: "tv-stand", title: "TV stand", price: 10, desc: "TV unit/stand.", popular: false, icon: "table" },
];

// Optional: keep if you want a “How it works” section later
export const furnitureSteps = [
  { title: "Choose an item", desc: "Pick what you need collecting and book online." },
  { title: "Pick a date", desc: "Choose the next available collection day for your area." },
  { title: "Pay by card", desc: "Secure online payment (Stripe)." },
  { title: "We collect", desc: "Our driver collects and disposes responsibly." },
];
