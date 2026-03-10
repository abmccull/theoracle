import type { ResourceDef } from "./schema";

export const resourceDefs: ResourceDef[] = [
  { id: "gold", label: "Gold", category: "currency" },
  { id: "sacred_water", label: "Sacred Water", category: "ritual", seasonalMultipliers: { Spring: 1.3, Summer: 0.7, Autumn: 1.0, Winter: 1.2 }, spoilage: { baseRatePerDay: 0.005, summerMultiplier: 1.0, lowConditionMultiplier: 1.5 } },
  { id: "olive_oil", label: "Olive Oil", category: "ritual" },
  { id: "incense", label: "Incense", category: "ritual" },
  { id: "grain", label: "Grain", category: "food", seasonalMultipliers: { Spring: 1.3, Summer: 1.0, Autumn: 0.6, Winter: 0.3 }, spoilage: { baseRatePerDay: 0.01, summerMultiplier: 1.5, lowConditionMultiplier: 2.0 } },
  { id: "sacred_animals", label: "Sacred Animals", category: "ritual", spoilage: { baseRatePerDay: 0.003, summerMultiplier: 1.0, lowConditionMultiplier: 2.0 } },
  { id: "bread", label: "Bread", category: "food", spoilage: { baseRatePerDay: 0.02, summerMultiplier: 1.5, lowConditionMultiplier: 2.0 } },
  { id: "olives", label: "Olives", category: "food", seasonalMultipliers: { Spring: 0.5, Summer: 0.7, Autumn: 1.4, Winter: 0.8 }, spoilage: { baseRatePerDay: 0.008, summerMultiplier: 1.5, lowConditionMultiplier: 2.0 } },
  { id: "papyrus", label: "Papyrus", category: "trade" },
  { id: "scrolls", label: "Scrolls", category: "trade" },
  { id: "logs", label: "Logs", category: "material" },
  { id: "stone", label: "Stone", category: "material" },
  { id: "planks", label: "Planks", category: "material" },
  { id: "cut_stone", label: "Cut Stone", category: "material" },
  { id: "knowledge", label: "Knowledge", category: "research" }
];
