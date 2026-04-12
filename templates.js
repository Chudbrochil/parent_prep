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
          "Muslin cloth / small blanket (multi-use)",
        ],
      },
      {
        name: "Eating",
        items: [
          "Bottle + formula OR nursing cover (if feeding time)",
          "2 burp cloths",
          "Water bottle (for parent)",
        ],
      },
      {
        name: "Diapers",
        items: [
          "2-3 diapers",
          "Wipes pack",
          "Travel changing pad",
          "Diaper cream (small tube)",
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
          "Pacifier + clip",
          "Small toy or lovey",
          "Tissues",
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
          "2 sets of pajamas (night leaks happen)",
          "Weather layers + hat",
          "Bibs (2)",
          "Muslin blanket (multi-use)",
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
          "Food pouches / snacks (6mo+)",
        ],
      },
      {
        name: "Diapers",
        items: [
          "Diapers (12-16)",
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
          "First aid basics (band-aids, saline drops)",
          "Bath supplies if not provided (baby soap, washcloth)",
          "Small book or quiet toy",
          "Sunscreen + sunhat (if outdoors, 6mo+)",
          "Wet bag / laundry bag for dirty clothes",
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
          "Spare outfits (4-5)",
          "Spare swaddles / muslins (multi-use)",
          "Weather layers + hat",
          "Change of shirt for parent",
          "Bibs",
          "Pajamas",
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
          "Burp cloths (4-5)",
          "Sippy cup with water (6mo+)",
          "Food pouches (6mo+)",
          "Baby spoons (6mo+)",
          "Puffs / crackers (6mo+)",
          "Snacks + water for parent",
        ],
      },
      {
        name: "Diapers",
        items: [
          "Diapers (15+, more for delays)",
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
          "Stroller rain cover",
        ],
      },
      {
        name: "Entertainment",
        items: [
          "Teethers",
          "Small new toy (surprise for the journey)",
          "Board books",
          "Tablet with downloaded shows (9mo+)",
          "Kid-sized headphones (9mo+)",
        ],
      },
      {
        name: "Health & documents",
        items: [
          "Baby Tylenol + Ibuprofen 6mo+ (ask pediatrician)",
          "Thermometer",
          "Prescription medications",
          "Birth certificate (required for infant flights)",
          "Passport (for international travel)",
          "Health insurance card",
          "Sunhat + sunscreen (6mo+)",
        ],
      },
      {
        name: "Parent survival",
        items: [
          "Hand sanitizer",
          "Disinfecting wipes",
          "Ziploc bags (multiple sizes)",
          "Barf bags / vomit ziplocs",
          "Trash bag for the car",
          "Power bank + extra charger cables",
        ],
      },
    ],
  },

  {
    id: "ruths-list",
    name: "Ruth's list",
    emoji: "🏡",
    description: "Extended stay — bringing the full home setup",
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
          "Blackout shades",
          "Noise machine",
          "Night light",
          "Baby monitor",
        ],
      },
      {
        name: "Eating",
        items: [
          "Nipple shields",
          "Pump",
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
