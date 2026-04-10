// ParentPrep — four trip templates, each grouped into categories.
// Users can also create their own custom lists in the app.
// Edit freely — this is the file to refine with your parenting group.
window.TEMPLATES = [

  {
    id: "short-trip",
    name: "Short trip",
    emoji: "🚗",
    description: "A diaper bag for the store, park, or quick errand",
    categories: [
      {
        name: "Clothes",
        items: [
          "1 spare outfit",
          "Bib",
        ],
      },
      {
        name: "Eating",
        items: [
          "Bottle + formula OR nursing cover (if feeding time)",
          "2 burp cloths",
        ],
      },
      {
        name: "Diapers",
        items: [
          "2-3 diapers",
          "Wipes pack",
          "Travel changing pad",
          "Disposable bags",
        ],
      },
      {
        name: "Transport",
        items: [
          "Car seat",
          "Stroller or baby carrier",
        ],
      },
      {
        name: "Other",
        items: [
          "Pacifier",
          "Hand sanitizer",
          "Hat (if sunny)",
        ],
      },
    ],
  },

  {
    id: "short-overnight",
    name: "Short overnight",
    emoji: "🎒",
    description: "A weekend nearby — 1 to 2 nights, short drive",
    categories: [
      {
        name: "Clothes",
        items: [
          "2-3 outfits",
          "Pajamas",
          "Weather layers + hat",
          "Bibs (2)",
        ],
      },
      {
        name: "Sleeping",
        items: [
          "Sleep sack",
          "Pacifier",
          "Comfort toy / lovey",
          "Portable white noise (optional)",
          "Night light (optional)",
        ],
      },
      {
        name: "Eating",
        items: [
          "Bottles (enough for all feedings)",
          "Formula pre-measured",
          "Nursing cover / pads (if breastfeeding)",
          "Burp cloths (3-4)",
        ],
      },
      {
        name: "Diapers",
        items: [
          "Diapers (8-10)",
          "Wipes pack + travel pack",
          "Travel changing pad",
          "Diaper rash cream",
          "Disposable bags",
        ],
      },
      {
        name: "Transport",
        items: [
          "Car seat",
          "Stroller",
          "Baby carrier",
        ],
      },
      {
        name: "Other",
        items: [
          "Baby Tylenol (ask pediatrician)",
          "Thermometer",
          "Toiletries if needed",
          "Health insurance card",
        ],
      },
    ],
  },

  {
    id: "long-trip",
    name: "Long trip",
    emoji: "✈️",
    description: "Plane, 8-hour drive, or multi-day journey",
    categories: [
      {
        name: "Clothes",
        items: [
          "Spare outfits (3-4)",
          "Spare swaddles / muslins (multi-use)",
          "Weather layers + hat",
          "Change of shirt for parent",
          "Bibs",
        ],
      },
      {
        name: "Sleeping",
        items: [
          "Sleep sack",
          "2 pacifiers (for ear pressure on takeoff)",
          "Comfort toy / lovey",
          "Portable white noise (optional)",
        ],
      },
      {
        name: "Eating",
        items: [
          "Bottles (pre-sterilized)",
          "Formula pre-measured OR pump + cooler",
          "Nursing cover",
          "Nursing pads",
          "Burp cloths (3-4)",
          "Sippy cup with water (6mo+)",
          "Food pouches (6mo+)",
          "Baby spoons (6mo+)",
          "Puffs / crackers (6mo+)",
        ],
      },
      {
        name: "Diapers",
        items: [
          "Diapers (10+)",
          "Full wipes pack + travel pack",
          "Travel changing pad",
          "Diaper rash cream",
          "Disposable bags for dirty diapers",
        ],
      },
      {
        name: "Transport",
        items: [
          "Car seat (gate-check if flying)",
          "Stroller (gate-check)",
          "Baby carrier (hands-free at airport)",
        ],
      },
      {
        name: "Other",
        items: [
          "Hand sanitizer",
          "Disinfecting wipes",
          "Baby Tylenol + Ibuprofen 6mo+ (ask pediatrician)",
          "Thermometer",
          "Birth certificate (required for infant flights)",
          "Health insurance card",
          "Sunhat + sunscreen (6mo+)",
          "Teethers",
        ],
      },
    ],
  },

  {
    id: "ruths-list",
    name: "Ruth's list",
    emoji: "🏡",
    description: "Extended stay — bringing the full setup",
    categories: [
      {
        name: "Clothes",
        items: [
          "Sweater",
          "Blanket",
          "6 onesies",
          "Free and clear laundry pods",
          "2 hats",
        ],
      },
      {
        name: "Sleeping",
        items: [
          "2 swaddles, 1 sleep sack",
          "2 sheets",
          "Pack and play bassinet",
          "Blackout shades?",
          "Noise machine",
          "Night light",
          "Baby monitor",
        ],
      },
      {
        name: "Eating",
        items: [
          "Nipple shields",
          "Pump?",
          "Formula",
          "Bottles",
          "Water warmer",
          "Burp cloths",
          "Bibs",
        ],
      },
      {
        name: "Diapers",
        items: [
          "Wipes",
          "Diapers",
          "Travel changing pad",
          "Diaper cream",
          "Plastic bags",
        ],
      },
      {
        name: "Transport",
        items: [
          "Stroller",
          "Car seat",
          "Baby bjorn carrier",
          "Baby bjorn bouncer",
        ],
      },
    ],
  },

];
