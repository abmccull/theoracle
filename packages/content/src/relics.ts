import type { DomainTag } from "./schema";

export type RelicDefId = string;

export type RelicDef = {
  id: RelicDefId;
  name: string;
  kind: "minor" | "major" | "legendary";
  domain: DomainTag;
  effectType: "credibility_bonus" | "resource_production" | "consultation_quality" | "priest_skill" | "omen_strength";
  effectValue: number;
  description: string;
};

export const relicDefs: RelicDef[] = [
  // --- MINOR RELICS (12) ---
  { id: "bronze-tripod", name: "Bronze Tripod", kind: "minor", domain: "spiritual", effectType: "consultation_quality", effectValue: 2, description: "A small bronze tripod from an earlier era of worship." },
  { id: "clay-tablet", name: "Clay Tablet", kind: "minor", domain: "economic", effectType: "resource_production", effectValue: 3, description: "An ancient accounting tablet with Mycenaean script." },
  { id: "votive-figurine", name: "Votive Figurine", kind: "minor", domain: "spiritual", effectType: "credibility_bonus", effectValue: 1, description: "A small terracotta figure left as an offering to the gods." },
  { id: "obsidian-blade", name: "Obsidian Blade", kind: "minor", domain: "military", effectType: "priest_skill", effectValue: 2, description: "A razor-sharp sacrificial blade of volcanic glass." },
  { id: "painted-shard", name: "Painted Shard", kind: "minor", domain: "economic", effectType: "resource_production", effectValue: 2, description: "A fragment of a decorated vessel depicting trade routes." },
  { id: "bronze-pin", name: "Bronze Pin", kind: "minor", domain: "military", effectType: "credibility_bonus", effectValue: 1, description: "A military decoration from a forgotten campaign." },
  { id: "seal-stone", name: "Seal Stone", kind: "minor", domain: "economic", effectType: "consultation_quality", effectValue: 1, description: "A carved seal stone bearing the mark of an ancient authority." },
  { id: "ivory-comb", name: "Ivory Comb", kind: "minor", domain: "spiritual", effectType: "omen_strength", effectValue: 2, description: "A delicately carved comb from a priestess's tomb." },
  { id: "copper-mirror", name: "Copper Mirror", kind: "minor", domain: "spiritual", effectType: "priest_skill", effectValue: 1, description: "A polished copper mirror used for divination." },
  { id: "stone-libation-cup", name: "Stone Libation Cup", kind: "minor", domain: "spiritual", effectType: "credibility_bonus", effectValue: 2, description: "A ceremonial cup carved from the sacred mountain." },
  { id: "lead-curse-tablet", name: "Lead Curse Tablet", kind: "minor", domain: "military", effectType: "omen_strength", effectValue: 3, description: "A folded lead sheet inscribed with binding curses." },
  { id: "ceramic-amphora", name: "Ceramic Amphora", kind: "minor", domain: "economic", effectType: "resource_production", effectValue: 2, description: "A well-preserved storage vessel from the palace period." },

  // --- MAJOR RELICS (8) ---
  { id: "golden-laurel", name: "Golden Laurel Wreath", kind: "major", domain: "spiritual", effectType: "credibility_bonus", effectValue: 5, description: "A wreath of beaten gold leaves, worn by an ancient Pythia." },
  { id: "bronze-helmet-hero", name: "Hero's Bronze Helmet", kind: "major", domain: "military", effectType: "priest_skill", effectValue: 5, description: "The helm of a legendary warrior, still bearing battle marks." },
  { id: "silver-phiale", name: "Silver Libation Bowl", kind: "major", domain: "spiritual", effectType: "consultation_quality", effectValue: 5, description: "A magnificent silver bowl used in the oldest rites of Delphi." },
  { id: "lapis-necklace", name: "Lapis Lazuli Necklace", kind: "major", domain: "economic", effectType: "resource_production", effectValue: 6, description: "An imported necklace proving ancient trade links to the East." },
  { id: "marble-stele", name: "Inscribed Marble Stele", kind: "major", domain: "military", effectType: "credibility_bonus", effectValue: 4, description: "A decree from a forgotten king acknowledging the oracle's power." },
  { id: "crystal-sphere", name: "Rock Crystal Sphere", kind: "major", domain: "spiritual", effectType: "omen_strength", effectValue: 6, description: "A flawless sphere of mountain crystal, humming with faint warmth." },
  { id: "gold-rhyton", name: "Gold Rhyton", kind: "major", domain: "economic", effectType: "resource_production", effectValue: 5, description: "A gold drinking horn shaped like a lion's head." },
  { id: "ivory-plaque", name: "Ivory Plaque of the Sybil", kind: "major", domain: "spiritual", effectType: "consultation_quality", effectValue: 4, description: "An ivory panel depicting the first oracle of Delphi." },

  // --- LEGENDARY RELICS (4) ---
  { id: "omphalos-fragment", name: "Fragment of the Omphalos", kind: "legendary", domain: "spiritual", effectType: "consultation_quality", effectValue: 10, description: "A piece of the original navel stone of the world. It pulses with warmth." },
  { id: "pythons-fang", name: "Python's Fang", kind: "legendary", domain: "military", effectType: "credibility_bonus", effectValue: 8, description: "A tooth from the great serpent slain by Apollo himself." },
  { id: "apollos-lyre-string", name: "String of Apollo's Lyre", kind: "legendary", domain: "spiritual", effectType: "omen_strength", effectValue: 10, description: "A single golden string that hums when touched by moonlight." },
  { id: "titans-tear", name: "Titan's Tear", kind: "legendary", domain: "economic", effectType: "resource_production", effectValue: 10, description: "A crystal said to be the crystallized tear of a defeated Titan." }
];

export const relicDefById: Record<string, RelicDef> = Object.fromEntries(
  relicDefs.map((r) => [r.id, r])
);

// Collection milestone thresholds and bonuses
export type CollectionMilestone = {
  relicCount: number;
  label: string;
  bonusType: "consultation_quality" | "credibility_all" | "knowledge_production" | "prestige";
  bonusValue: number;
};

export const collectionMilestones: CollectionMilestone[] = [
  { relicCount: 3, label: "Curious Collection", bonusType: "consultation_quality", bonusValue: 2 },
  { relicCount: 6, label: "Notable Archive", bonusType: "credibility_all", bonusValue: 1 },
  { relicCount: 10, label: "Renowned Treasury", bonusType: "knowledge_production", bonusValue: 3 },
  { relicCount: 15, label: "Legendary Vault", bonusType: "prestige", bonusValue: 5 }
];
