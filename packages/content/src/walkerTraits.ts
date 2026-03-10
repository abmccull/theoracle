import type { WalkerTraitId } from "./schema";

export type WalkerTraitDef = {
  id: WalkerTraitId;
  name: string;
  description: string;
  effect: { key: string; value: number };
};

export const walkerTraitDefs: Record<WalkerTraitId, WalkerTraitDef> = {
  industrious: {
    id: "industrious",
    name: "Industrious",
    description: "+20% work speed",
    effect: { key: "work_speed", value: 0.20 },
  },
  devout: {
    id: "devout",
    name: "Devout",
    description: "+15% repair speed on ritual buildings",
    effect: { key: "repair_speed", value: 0.15 },
  },
  shrewd: {
    id: "shrewd",
    name: "Shrewd",
    description: "+10% resource efficiency",
    effect: { key: "resource_efficiency", value: 0.10 },
  },
  hardy: {
    id: "hardy",
    name: "Hardy",
    description: "Hunger rate reduced 30%",
    effect: { key: "hunger_reduction", value: 0.30 },
  },
  swift: {
    id: "swift",
    name: "Swift",
    description: "+25% movement speed",
    effect: { key: "movement_speed", value: 0.25 },
  },
  skilled_builder: {
    id: "skilled_builder",
    name: "Skilled Builder",
    description: "+30% construction speed",
    effect: { key: "construction_speed", value: 0.30 },
  },
  careful: {
    id: "careful",
    name: "Careful",
    description: "-20% spoilage on carried resources",
    effect: { key: "spoilage_reduction", value: 0.20 },
  },
  charismatic: {
    id: "charismatic",
    name: "Charismatic",
    description: "+10% visitor satisfaction",
    effect: { key: "visitor_satisfaction", value: 0.10 },
  },
};

export const WALKER_TRAIT_IDS: WalkerTraitId[] = Object.keys(walkerTraitDefs) as WalkerTraitId[];
