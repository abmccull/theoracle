import type { BuildingDef } from "./schema";

export const buildingDefs: Record<BuildingDef["id"], BuildingDef> = {
  sacred_way: {
    id: "sacred_way",
    name: "Sacred Way",
    description: "Processional road for pilgrims and envoys.",
    category: "processional",
    costGold: 1,
    requiresPriest: false,
    maxCondition: 100,
    color: 0xcaa66b,
    upkeep: {},
    startingResources: {},
    passiveEffects: [{ id: "pilgrim-flow", kind: "pilgrim_capacity", value: 2, notes: "Raises precinct throughput for arrivals." }]
  },
  priest_quarters: {
    id: "priest_quarters",
    name: "Priest Quarters",
    description: "Houses the priesthood and anchors daily assignments.",
    category: "housing",
    costGold: 22,
    requiresPriest: false,
    maxCondition: 100,
    color: 0xdfd2b0,
    upkeep: { grain: 0.01 },
    startingResources: {},
    staffing: {
      priests: { attendant: 2, spring_warden: 1, flame_keeper: 1 },
      custodians: 1
    },
    storageCaps: {
      grain: 8,
      bread: 8
    },
    housingCapacity: { priests: 4 }
  },
  storehouse: {
    id: "storehouse",
    name: "Storehouse",
    description: "Buffers food, incense, and oil reserves.",
    category: "storage",
    costGold: 26,
    requiresPriest: false,
    maxCondition: 100,
    color: 0x9d7658,
    upkeep: {},
    startingResources: { olive_oil: 4, grain: 8, incense: 3 },
    storageCaps: {
      grain: 60,
      incense: 24,
      olive_oil: 24,
      bread: 30,
      scrolls: 18,
      papyrus: 18,
      sacred_water: 40,
      sacred_animals: 4,
      logs: 30,
      stone: 30,
      planks: 20,
      cut_stone: 20
    },
    passiveEffects: [{ id: "storehouse-buffer", kind: "storage_buffer", value: 1, notes: "Stabilizes delivery targets for core ritual goods." }],
    spoilageReduction: { grain: 0.50, bread: 0.50, olives: 0.50, sacred_water: 0.50, sacred_animals: 0.50 }
  },
  castalian_spring: {
    id: "castalian_spring",
    name: "Castalian Spring",
    description: "Purification waters for the Pythia and pilgrims.",
    category: "ritual",
    costGold: 18,
    requiresPriest: true,
    maxCondition: 100,
    color: 0x60a5d8,
    upkeep: {},
    startingResources: { sacred_water: 6 },
    staffing: {
      priests: { spring_warden: 1 }
    },
    recipes: [
      {
        id: "draw-sacred-water",
        consumes: {},
        produces: { sacred_water: 0.15 },
        dailyRate: 1,
        requiresRoles: ["spring_warden"],
        notes: "Provides steady ritual purification stock."
      }
    ],
    requiredNearbyTerrain: { terrainTypes: ["water"], depositType: "sacred_spring", maxDistance: 2 },
    productionCycle: { depositType: "sacred_spring", gatherTicks: 30, gatherYield: 1.0, processTicks: 10 },
    spoilageReduction: { sacred_water: 0.10 }
  },
  inner_sanctum: {
    id: "inner_sanctum",
    name: "Inner Sanctum",
    description: "Seat of the Pythia and heart of consultations.",
    category: "ritual",
    costGold: 42,
    requiresPriest: true,
    maxCondition: 120,
    color: 0xd7c8a0,
    upkeep: { incense: 0.01, sacred_water: 0.01 },
    startingResources: {},
    unlockTier: "obscure",
    staffing: {
      priests: { attendant: 1, augur: 1 }
    },
    passiveEffects: [{ id: "consultation-prestige", kind: "prestige", value: 3, notes: "The sanctum anchors campaign progression and envoy confidence." }]
  },
  eternal_flame_brazier: {
    id: "eternal_flame_brazier",
    name: "Eternal Flame Brazier",
    description: "Consumes olive oil and symbolizes divine favor.",
    category: "ritual",
    costGold: 16,
    requiresPriest: true,
    maxCondition: 100,
    color: 0xf08a24,
    upkeep: { olive_oil: 0.015 },
    startingResources: { olive_oil: 4 },
    staffing: {
      priests: { flame_keeper: 1 }
    },
    passiveEffects: [{ id: "flame-prestige", kind: "prestige", value: 1, resourceId: "olive_oil", notes: "Well-fed flame improves visible sanctity." }],
    adjacencyBonuses: [
      { nearDefId: "inner_sanctum", bonusKind: "production", value: -0.10, maxDistance: 2 }
    ]
  },
  sacrificial_altar: {
    id: "sacrificial_altar",
    name: "Sacrificial Altar",
    description: "Processes sacred animals into stronger ritual legitimacy and omen weight.",
    category: "ritual",
    costGold: 34,
    requiresPriest: true,
    maxCondition: 110,
    color: 0xb35f3f,
    unlockTier: "recognized",
    upkeep: { incense: 0.01 },
    startingResources: {},
    staffing: {
      priests: { sacrificial_priest: 1, attendant: 1 }
    },
    recipes: [
      {
        id: "sacrifice-animal",
        consumes: { sacred_animals: 0.08, incense: 0.01 },
        produces: {},
        dailyRate: 1,
        requiresRoles: ["sacrificial_priest"],
        notes: "Raises omen quality input for higher-risk consultation tracks."
      }
    ],
    passiveEffects: [{ id: "omen-quality", kind: "omen_quality", value: 2, notes: "Prepared sacrifice improves consultation reliability ceilings." }]
  },
  animal_pen: {
    id: "animal_pen",
    name: "Animal Pen",
    description: "Keeps sacrificial stock healthy and near the precinct.",
    category: "production",
    costGold: 24,
    requiresPriest: false,
    maxCondition: 95,
    color: 0x8d6a45,
    unlockTier: "recognized",
    upkeep: { grain: 0.02 },
    startingResources: { sacred_animals: 1 },
    staffing: {
      custodians: 1
    },
    storageCaps: {
      sacred_animals: 8,
      grain: 20,
      bread: 4
    },
    recipes: [
      {
        id: "raise-sacred-animals",
        consumes: { grain: 0.08 },
        produces: { sacred_animals: 0.09 },
        dailyRate: 1,
        notes: "Converts feed into a steady altar supply."
      }
    ],
    spoilageReduction: { sacred_animals: 0.30 }
  },
  granary: {
    id: "granary",
    name: "Granary",
    description: "Bulk grain reserve that smooths seasonal hunger and workshop supply.",
    category: "storage",
    costGold: 28,
    requiresPriest: false,
    maxCondition: 105,
    color: 0xba9158,
    unlockTier: "recognized",
    upkeep: {},
    startingResources: { grain: 12 },
    storageCaps: {
      grain: 120,
      bread: 36
    },
    passiveEffects: [{ id: "granary-buffer", kind: "storage_buffer", value: 2, resourceId: "grain", notes: "Absorbs caravan variability for food chains." }],
    spoilageReduction: { grain: 0.20, bread: 0.20 }
  },
  kitchen: {
    id: "kitchen",
    name: "Temple Kitchen",
    description: "Turns stored grain into bread for priests, pilgrims, and resident workers.",
    category: "production",
    costGold: 20,
    requiresPriest: false,
    maxCondition: 95,
    color: 0xc7834e,
    unlockTier: "recognized",
    upkeep: { grain: 0.015 },
    startingResources: {},
    staffing: {
      custodians: 1
    },
    storageCaps: {
      bread: 24,
      grain: 24
    },
    recipes: [
      {
        id: "bake-bread",
        consumes: { grain: 0.12 },
        produces: { bread: 0.1 },
        dailyRate: 1,
        notes: "Foundational food chain for growing staffing and hospitality."
      }
    ],
    adjacencyBonuses: [
      { nearDefId: "granary", bonusKind: "production", value: 0.10, maxDistance: 3 }
    ]
  },
  olive_press: {
    id: "olive_press",
    name: "Olive Press",
    description: "Presses raw olives into the oil that keeps the precinct's rituals alive.",
    category: "production",
    costGold: 23,
    requiresPriest: false,
    maxCondition: 95,
    color: 0x768a42,
    unlockTier: "recognized",
    upkeep: { olives: 0.02 },
    startingResources: { olives: 2 },
    storageCaps: {
      olives: 24,
      olive_oil: 24,
      grain: 4,
      bread: 4
    },
    recipes: [
      {
        id: "press-olives",
        consumes: { olives: 0.12 },
        produces: { olive_oil: 0.1 },
        dailyRate: 1,
        notes: "Feeds braziers and high-status rites."
      }
    ],
    adjacencyBonuses: [
      { nearDefId: "olive_grove", bonusKind: "production", value: 0.12, maxDistance: 3 }
    ]
  },
  incense_store: {
    id: "incense_store",
    name: "Incense Store",
    description: "Dedicated reserve for ritual incense and papyrus imports.",
    category: "storage",
    costGold: 21,
    requiresPriest: false,
    maxCondition: 95,
    color: 0x7f5c62,
    unlockTier: "recognized",
    upkeep: {},
    startingResources: { incense: 4, papyrus: 2 },
    storageCaps: {
      incense: 30,
      papyrus: 20,
      scrolls: 20
    },
    passiveEffects: [{ id: "ritual-buffer", kind: "storage_buffer", value: 1, resourceId: "incense", notes: "Protects sanctum rituals from convoy gaps." }]
  },
  agora_market: {
    id: "agora_market",
    name: "Agora Market",
    description: "A commercial forecourt that converts prestige and traffic into income.",
    category: "trade",
    costGold: 30,
    requiresPriest: false,
    maxCondition: 100,
    color: 0x5d7f7f,
    unlockTier: "revered",
    cityTierRequirement: "town",
    upkeep: { bread: 0.01, incense: 0.005 },
    startingResources: {},
    staffing: {
      custodians: 1,
      carriers: 1,
      visitors: 6
    },
    passiveEffects: [{ id: "market-income", kind: "trade_income", value: 4, notes: "High-traffic precincts convert goods and reputation into treasury flow." }]
  },
  xenon: {
    id: "xenon",
    name: "Xenon",
    description: "Guest lodging for envoys, pilgrims, and wealthy benefactors.",
    category: "hospitality",
    costGold: 32,
    requiresPriest: false,
    maxCondition: 105,
    color: 0x8a8fb0,
    unlockTier: "revered",
    upkeep: { bread: 0.015, sacred_water: 0.01 },
    startingResources: {},
    staffing: {
      custodians: 1,
      visitors: 10
    },
    passiveEffects: [
      { id: "guest-capacity", kind: "pilgrim_capacity", value: 6, notes: "More visitors can be hosted during campaign peaks." },
      { id: "guest-donations", kind: "donation", value: 3, notes: "Comfortable guests donate more reliably." }
    ],
    housingCapacity: { carriers: 1, custodians: 1 }
  },
  grain_field: {
    id: "grain_field",
    name: "Grain Field",
    description: "Terraced plots that produce a steady grain harvest for the precinct.",
    category: "production",
    costGold: 15,
    requiresPriest: false,
    maxCondition: 95,
    color: 0xc8b44e,
    upkeep: {},
    startingResources: { grain: 2 },
    staffing: {
      custodians: 1
    },
    storageCaps: {
      grain: 30,
      bread: 4
    },
    recipes: [
      {
        id: "harvest-grain",
        consumes: {},
        produces: { grain: 0.15 },
        dailyRate: 1,
        notes: "Base grain production. Seasonal climate affects yield."
      }
    ],
    requiredNearbyTerrain: { terrainTypes: ["grass"], depositType: "fertile_soil", maxDistance: 2 },
    productionCycle: { depositType: "fertile_soil", gatherTicks: 60, gatherYield: 1.5, processTicks: 15 }
  },
  olive_grove: {
    id: "olive_grove",
    name: "Olive Grove",
    description: "Sacred olive trees planted on the temple slopes, yielding fruit for the press.",
    category: "production",
    costGold: 18,
    requiresPriest: false,
    maxCondition: 95,
    color: 0x6b8e3a,
    upkeep: {},
    startingResources: { olives: 2 },
    staffing: {
      custodians: 1
    },
    storageCaps: {
      olives: 30,
      grain: 4,
      bread: 4
    },
    recipes: [
      {
        id: "harvest-olives",
        consumes: {},
        produces: { olives: 0.12 },
        dailyRate: 1,
        notes: "Olives peak in autumn. One grove nearly sustains one press."
      }
    ],
    requiredNearbyTerrain: { terrainTypes: ["grass"], depositType: "fertile_soil", maxDistance: 3 },
    productionCycle: { depositType: "fertile_soil", gatherTicks: 45, gatherYield: 1.2, processTicks: 15 }
  },
  incense_workshop: {
    id: "incense_workshop",
    name: "Incense Workshop",
    description: "Blends imported resins into the sacred incense used throughout the precinct.",
    category: "production",
    costGold: 25,
    requiresPriest: true,
    maxCondition: 100,
    color: 0x8a6b5e,
    unlockTier: "recognized",
    upkeep: {},
    startingResources: {},
    staffing: {
      priests: { attendant: 1 },
      custodians: 1
    },
    storageCaps: {
      incense: 20,
      grain: 4,
      bread: 4
    },
    recipes: [
      {
        id: "blend-incense",
        consumes: {},
        produces: { incense: 0.08 },
        dailyRate: 1,
        requiresRoles: ["attendant"],
        notes: "Provides comfortable incense surplus once recognized tier is reached."
      }
    ]
  },
  papyrus_reed_bed: {
    id: "papyrus_reed_bed",
    name: "Papyrus Reed Bed",
    description: "Irrigated beds that convert sacred water into writing material for the scholars.",
    category: "production",
    costGold: 20,
    requiresPriest: false,
    maxCondition: 95,
    color: 0x5a9e6b,
    unlockTier: "recognized",
    upkeep: {},
    startingResources: {},
    staffing: {
      custodians: 1
    },
    storageCaps: {
      papyrus: 20,
      sacred_water: 10,
      grain: 4,
      bread: 4
    },
    recipes: [
      {
        id: "press-papyrus",
        consumes: { sacred_water: 0.03 },
        produces: { papyrus: 0.06 },
        dailyRate: 1,
        notes: "Creates tension: sacred water feeds both purification and knowledge."
      }
    ]
  },
  scriptorium: {
    id: "scriptorium",
    name: "Scriptorium",
    description: "Scholar-priests transcribe prophecies and lore onto papyrus scrolls.",
    category: "production",
    costGold: 30,
    requiresPriest: true,
    maxCondition: 100,
    color: 0x7a6e8a,
    unlockTier: "revered",
    upkeep: {},
    startingResources: {},
    staffing: {
      priests: { scholar: 1 }
    },
    storageCaps: {
      papyrus: 12,
      scrolls: 18
    },
    recipes: [
      {
        id: "transcribe-scrolls",
        consumes: { papyrus: 0.04 },
        produces: { scrolls: 0.03 },
        dailyRate: 1,
        requiresRoles: ["scholar"],
        notes: "Slow prestige production. Scrolls enhance consultations."
      }
    ],
    passiveEffects: [{ id: "scriptorium-prestige", kind: "prestige", value: 2, notes: "The written word elevates Delphi's scholarly reputation." }],
    adjacencyBonuses: [
      { nearDefId: "library", bonusKind: "production", value: 0.15, maxDistance: 3 }
    ]
  },
  library: {
    id: "library",
    name: "Library",
    description: "A repository of sacred scrolls and prophecy records that deepens Delphi's authority.",
    category: "storage",
    costGold: 38,
    requiresPriest: true,
    maxCondition: 110,
    color: 0x6a5c8a,
    unlockTier: "revered",
    upkeep: { scrolls: 0.01 },
    startingResources: {},
    staffing: {
      priests: { scholar: 1 }
    },
    storageCaps: {
      scrolls: 40,
      papyrus: 20,
      knowledge: 60
    },
    recipes: [
      {
        id: "generate-knowledge",
        consumes: { scrolls: 0.02 },
        produces: { knowledge: 0.04 },
        dailyRate: 1,
        requiresRoles: ["scholar"],
        notes: "Scholars study accumulated scrolls to produce research knowledge."
      }
    ],
    passiveEffects: [
      { id: "library-prestige", kind: "prestige", value: 4, notes: "A well-stocked library cements Delphi's intellectual primacy." },
      { id: "library-omen", kind: "omen_quality", value: 1, notes: "Recorded precedents improve prophecy calibration." }
    ],
    adjacencyBonuses: [
      { nearDefId: "scriptorium", bonusKind: "production", value: 0.15, maxDistance: 3 }
    ]
  },
  hylotomos_camp: {
    id: "hylotomos_camp",
    name: "Logging Camp",
    description: "Woodcutters fell timber on the mountain slopes above the precinct.",
    category: "production",
    costGold: 12,
    constructionWork: 4,
    requiresPriest: false,
    maxCondition: 90,
    color: 0x6b5a3e,
    upkeep: {},
    startingResources: { logs: 3 },
    staffing: { custodians: 1 },
    storageCaps: { logs: 30, grain: 4, bread: 4 },
    recipes: [
      {
        id: "fell-timber",
        consumes: {},
        produces: { logs: 0.14 },
        dailyRate: 1,
        notes: "Base timber production. No input required."
      }
    ],
    requiredNearbyTerrain: { terrainTypes: ["forest"], depositType: "timber", maxDistance: 3 },
    productionCycle: { depositType: "timber", gatherTicks: 40, gatherYield: 1.2, processTicks: 20 }
  },
  tekton_ergasterion: {
    id: "tekton_ergasterion",
    name: "Carpenter's Workshop",
    description: "Skilled carpenters saw and plane logs into structural planks.",
    category: "production",
    costGold: 22,
    costResources: { logs: 6, stone: 4 },
    constructionWork: 6,
    requiresPriest: false,
    maxCondition: 95,
    color: 0x9e7b4a,
    unlockTier: "recognized",
    upkeep: {},
    startingResources: {},
    staffing: { custodians: 1 },
    storageCaps: { logs: 20, planks: 24, grain: 4, bread: 4 },
    recipes: [
      {
        id: "saw-planks",
        consumes: { logs: 0.10 },
        produces: { planks: 0.08 },
        dailyRate: 1,
        notes: "Converts raw logs into construction-grade planks."
      }
    ]
  },
  lithoxoos: {
    id: "lithoxoos",
    name: "Stonecutter's Workshop",
    description: "Masons shape raw stone into precisely cut blocks for temples and monuments.",
    category: "production",
    costGold: 24,
    costResources: { logs: 4, stone: 6 },
    constructionWork: 7,
    requiresPriest: false,
    maxCondition: 100,
    color: 0x7a7a72,
    unlockTier: "recognized",
    upkeep: {},
    startingResources: {},
    staffing: { custodians: 1 },
    storageCaps: { stone: 20, cut_stone: 24, grain: 4, bread: 4 },
    recipes: [
      {
        id: "cut-stone-blocks",
        consumes: { stone: 0.10 },
        produces: { cut_stone: 0.07 },
        dailyRate: 1,
        notes: "Converts raw stone into dressed blocks. Slower than plank production."
      }
    ]
  },
  lithotomia: {
    id: "lithotomia",
    name: "Stone Quarry",
    description: "Quarrymen extract limestone and marble from the sacred cliffs.",
    category: "production",
    costGold: 14,
    constructionWork: 5,
    requiresPriest: false,
    maxCondition: 100,
    color: 0x8a8a80,
    upkeep: {},
    startingResources: { stone: 3 },
    staffing: { custodians: 1 },
    storageCaps: { stone: 30, grain: 4, bread: 4 },
    recipes: [
      {
        id: "quarry-stone",
        consumes: {},
        produces: { stone: 0.12 },
        dailyRate: 1,
        notes: "Base stone production. Slower than timber."
      }
    ],
    requiredNearbyTerrain: { terrainTypes: ["limestone"], depositType: "stone", maxDistance: 3 },
    productionCycle: { depositType: "stone", gatherTicks: 50, gatherYield: 1.0, processTicks: 25 }
  },
  ergasterion: {
    id: "ergasterion",
    name: "Worker Quarters",
    description: "Simple lodgings for the carriers and custodians who keep the precinct running.",
    category: "housing",
    costGold: 18,
    costResources: { logs: 4, stone: 3 },
    constructionWork: 5,
    requiresPriest: false,
    maxCondition: 95,
    color: 0xb8a080,
    upkeep: { bread: 0.01 },
    startingResources: {},
    staffing: { custodians: 1 },
    housingCapacity: { carriers: 3, custodians: 3 }
  },
  apotheke: {
    id: "apotheke",
    name: "Supply Depot",
    description: "A logistics hub that stages materials for construction and ritual supply routes.",
    category: "storage",
    costGold: 26,
    costResources: { logs: 6, stone: 6 },
    constructionWork: 6,
    requiresPriest: false,
    maxCondition: 100,
    color: 0x8a7652,
    unlockTier: "recognized",
    upkeep: {},
    startingResources: {},
    storageCaps: {
      logs: 40,
      stone: 40,
      planks: 30,
      cut_stone: 30
    },
    passiveEffects: [
      {
        id: "depot-carrier-range",
        kind: "carrier_range",
        value: 2,
        notes: "Carriers assigned near the depot gain extended supply radius."
      }
    ]
  },
  treasury_of_nations: {
    id: "treasury_of_nations",
    name: "Treasury of Nations",
    description: "A grand vault where offerings from across Hellas are stored, generating steady gold income.",
    category: "storage",
    costGold: 60,
    costResources: { cut_stone: 40, planks: 20 },
    constructionWork: 12,
    requiresPriest: true,
    maxCondition: 130,
    color: 0xd4af37,
    unlockTier: "panhellenic",
    requiredTech: "monumental_construction",
    cityTierRequirement: "city",
    upkeep: { incense: 0.01 },
    startingResources: {},
    staffing: {
      priests: { attendant: 1 },
      custodians: 1
    },
    storageCaps: {
      gold: 200
    },
    recipes: [
      {
        id: "tribute-collection",
        consumes: {},
        produces: { gold: 0.1 },
        dailyRate: 1,
        notes: "Panhellenic tribute flows into the treasury."
      }
    ],
    passiveEffects: [
      { id: "treasury-prestige", kind: "prestige", value: 6, notes: "The wealth of nations elevates Delphi's grandeur." }
    ]
  },
  stoa_of_columns: {
    id: "stoa_of_columns",
    name: "Stoa of Columns",
    description: "A monumental colonnade where citizens gather, bolstering the oracle's public credibility.",
    category: "trade",
    costGold: 55,
    costResources: { cut_stone: 50, planks: 30 },
    constructionWork: 14,
    requiresPriest: false,
    maxCondition: 140,
    color: 0xc0c0c0,
    unlockTier: "panhellenic",
    requiredTech: "monumental_construction",
    cityTierRequirement: "town",
    upkeep: { bread: 0.01 },
    startingResources: {},
    staffing: {
      custodians: 2,
      visitors: 8
    },
    passiveEffects: [
      { id: "stoa-prestige", kind: "prestige", value: 5, notes: "A grand public space attracts dignitaries and scholars." },
      { id: "stoa-pilgrim", kind: "pilgrim_capacity", value: 4, notes: "The colonnade shelters many visitors." }
    ]
  },
  sacred_theater: {
    id: "sacred_theater",
    name: "Sacred Theater",
    description: "A grand amphitheater for sacred performances and festival rites that inspire pilgrims.",
    category: "ritual",
    costGold: 50,
    costResources: { cut_stone: 30, planks: 40 },
    constructionWork: 10,
    requiresPriest: true,
    maxCondition: 120,
    color: 0xa0522d,
    unlockTier: "panhellenic",
    requiredTech: "monumental_construction",
    cityTierRequirement: "city",
    upkeep: { incense: 0.005, bread: 0.01 },
    startingResources: {},
    staffing: {
      priests: { attendant: 1 },
      custodians: 1,
      visitors: 12
    },
    passiveEffects: [
      { id: "theater-prestige", kind: "prestige", value: 4, notes: "Sacred performances elevate Delphi's cultural renown." },
      { id: "theater-omen", kind: "omen_quality", value: 2, notes: "Ritual drama deepens consultation atmosphere." },
      { id: "theater-donation", kind: "donation", value: 4, notes: "Festival audiences donate generously." }
    ]
  }
};
