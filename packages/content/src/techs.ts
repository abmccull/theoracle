import type { TechDef } from "./schema";

export const techDefs: TechDef[] = [
  // Construction
  {
    id: "masonry_i",
    name: "Stone Foundations",
    description: "Basic stonework techniques enable the construction of a stonecutter's workshop.",
    category: "construction",
    knowledgeCost: 15,
    effects: [{ kind: "unlock_building", buildingId: "lithoxoos" }]
  },
  {
    id: "carpentry_i",
    name: "Timber Framing",
    description: "Joinery and framing methods enable a proper carpenter's workshop.",
    category: "construction",
    knowledgeCost: 15,
    effects: [{ kind: "unlock_building", buildingId: "tekton_ergasterion" }]
  },
  {
    id: "advanced_masonry",
    name: "Dressed Stone",
    description: "Precision cutting yields more usable stone from each block.",
    category: "construction",
    knowledgeCost: 30,
    requires: ["masonry_i"],
    effects: [{ kind: "production_bonus", buildingId: "lithoxoos", recipeId: "cut-stone-blocks", multiplier: 1.2 }]
  },
  {
    id: "advanced_carpentry",
    name: "Joinery",
    description: "Advanced woodworking yields more planks from each log.",
    category: "construction",
    knowledgeCost: 30,
    requires: ["carpentry_i"],
    effects: [{ kind: "production_bonus", buildingId: "tekton_ergasterion", recipeId: "saw-planks", multiplier: 1.2 }]
  },
  {
    id: "efficient_quarrying",
    name: "Deep Quarrying",
    description: "Deeper extraction methods increase stone output.",
    category: "construction",
    knowledgeCost: 25,
    requires: ["masonry_i"],
    effects: [{ kind: "production_bonus", buildingId: "lithotomia", recipeId: "quarry-stone", multiplier: 1.25 }]
  },
  {
    id: "efficient_logging",
    name: "Managed Forestry",
    description: "Sustainable harvesting practices increase timber yield.",
    category: "construction",
    knowledgeCost: 25,
    requires: ["carpentry_i"],
    effects: [{ kind: "production_bonus", buildingId: "hylotomos_camp", recipeId: "fell-timber", multiplier: 1.25 }]
  },
  {
    id: "bronze_tools",
    name: "Bronze Tools",
    description: "Superior tools boost all material production.",
    category: "construction",
    knowledgeCost: 40,
    requires: ["masonry_i", "carpentry_i"],
    effects: [
      { kind: "production_bonus", buildingId: "hylotomos_camp", recipeId: "fell-timber", multiplier: 1.15 },
      { kind: "production_bonus", buildingId: "lithotomia", recipeId: "quarry-stone", multiplier: 1.15 },
      { kind: "production_bonus", buildingId: "tekton_ergasterion", recipeId: "saw-planks", multiplier: 1.15 },
      { kind: "production_bonus", buildingId: "lithoxoos", recipeId: "cut-stone-blocks", multiplier: 1.15 }
    ]
  },
  {
    id: "monumental_construction",
    name: "Monumental Works",
    description: "Grand building techniques unlock panhellenic-tier structures.",
    category: "construction",
    knowledgeCost: 60,
    requires: ["advanced_masonry", "advanced_carpentry"],
    effects: [
      { kind: "construction_speed", multiplier: 1.25 },
      { kind: "unlock_building", buildingId: "treasury_of_nations" },
      { kind: "unlock_building", buildingId: "stoa_of_columns" },
      { kind: "unlock_building", buildingId: "sacred_theater" }
    ]
  },

  // Ritual
  {
    id: "ritual_architecture",
    name: "Ritual Architecture",
    description: "Sacred building designs reduce incense consumption in ritual buildings.",
    category: "ritual",
    knowledgeCost: 35,
    requires: ["masonry_i"],
    effects: [
      { kind: "upkeep_reduction", buildingId: "inner_sanctum", resourceId: "incense", multiplier: 0.8 },
      { kind: "upkeep_reduction", buildingId: "eternal_flame_brazier", resourceId: "olive_oil", multiplier: 0.8 }
    ]
  },
  {
    id: "sacred_geometry",
    name: "Sacred Geometry",
    description: "Mathematical proportions enhance the spiritual power of all ritual buildings.",
    category: "ritual",
    knowledgeCost: 50,
    requires: ["ritual_architecture"],
    effects: [
      { kind: "storage_bonus", resourceId: "incense", bonusCapacity: 10 },
      { kind: "storage_bonus", resourceId: "sacred_water", bonusCapacity: 15 }
    ]
  },
  {
    id: "refined_incense",
    name: "Refined Incense",
    description: "Better blending techniques increase incense output.",
    category: "ritual",
    knowledgeCost: 25,
    effects: [{ kind: "production_bonus", buildingId: "incense_workshop", recipeId: "blend-incense", multiplier: 1.2 }]
  },

  // Economy
  {
    id: "extended_logistics",
    name: "Extended Logistics",
    description: "Improved road networks extend carrier supply range.",
    category: "economy",
    knowledgeCost: 20,
    effects: [{ kind: "carrier_capacity", bonus: 2 }]
  },
  {
    id: "population_management",
    name: "Population Management",
    description: "Administrative techniques allow more workers per housing building.",
    category: "economy",
    knowledgeCost: 30,
    requires: ["extended_logistics"],
    effects: [
      { kind: "housing_bonus", buildingId: "ergasterion", bonusSlots: { carriers: 1, custodians: 1 } },
      { kind: "housing_bonus", buildingId: "xenon", bonusSlots: { carriers: 1, custodians: 1 } }
    ]
  },

  // Knowledge
  {
    id: "archival_methods",
    name: "Archival Methods",
    description: "Systematic cataloguing accelerates knowledge production.",
    category: "knowledge",
    knowledgeCost: 20,
    effects: [{ kind: "production_bonus", buildingId: "library", recipeId: "generate-knowledge", multiplier: 1.25 }]
  },
  {
    id: "oracle_expansion",
    name: "Oracle Expansion",
    description: "A culmination of sacred and scholarly arts unlocks legendary consultation prerequisites.",
    category: "knowledge",
    knowledgeCost: 45,
    requires: ["archival_methods", "sacred_geometry"],
    effects: [{ kind: "storage_bonus", resourceId: "knowledge", bonusCapacity: 50 }]
  },

  // Agriculture
  {
    id: "advanced_agriculture",
    name: "Advanced Agriculture",
    description: "Crop rotation and irrigation techniques boost food output from fields and groves.",
    category: "economy",
    knowledgeCost: 25,
    requires: ["extended_logistics"],
    effects: [
      { kind: "production_bonus", buildingId: "grain_field", recipeId: "harvest-grain", multiplier: 1.2 },
      { kind: "production_bonus", buildingId: "olive_grove", recipeId: "harvest-olives", multiplier: 1.2 }
    ]
  },

  // Diplomacy
  {
    id: "diplomatic_protocol",
    name: "Diplomatic Protocol",
    description: "Formalised envoy rituals amplify the credibility gained from each consultation.",
    category: "economy",
    knowledgeCost: 35,
    requires: ["extended_logistics"],
    effects: [{ kind: "credibility_bonus", multiplier: 1.1 }]
  },

  // Sacred construction
  {
    id: "sacred_architecture",
    name: "Sacred Architecture",
    description: "Consecrated building methods unlock the sacred theater and elevate Delphi's prestige.",
    category: "construction",
    knowledgeCost: 50,
    requires: ["advanced_masonry"],
    effects: [
      { kind: "unlock_building", buildingId: "sacred_theater" },
      { kind: "prestige_bonus", value: 5 }
    ]
  },

  // Espionage
  {
    id: "espionage_tradecraft",
    name: "Espionage Tradecraft",
    description: "Advanced spy techniques improve agent success rates and unlock the double agent trait.",
    category: "economy",
    knowledgeCost: 40,
    requires: ["extended_logistics"],
    effects: [{ kind: "espionage_bonus", successRateBonus: 15, unlockTrait: "double_agent" }]
  },

  // Civic
  {
    id: "civic_planning",
    name: "Civic Planning",
    description: "Urban design principles increase housing capacity across all residential buildings.",
    category: "economy",
    knowledgeCost: 35,
    requires: ["population_management"],
    effects: [
      { kind: "housing_bonus", buildingId: "priest_quarters", bonusSlots: { priests: 1 } },
      { kind: "housing_bonus", buildingId: "ergasterion", bonusSlots: { carriers: 1, custodians: 1 } },
      { kind: "housing_bonus", buildingId: "xenon", bonusSlots: { carriers: 1, custodians: 1 } }
    ]
  }
];

export const techDefById: Record<string, TechDef> = Object.fromEntries(
  techDefs.map((t) => [t.id, t])
);
